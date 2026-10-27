// Base de données SQLite intégrée à Node (node:sqlite), sans dépendance native.
// Aucune donnée personnelle d'adulte : ni nom, ni e-mail, ni numéro de téléphone.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

-- L'organisateur est un rôle. Il se reconnecte avec un code d'accès, conservé uniquement sous forme d'empreinte.
CREATE TABLE IF NOT EXISTS organizers (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL,
  access_hash TEXT NOT NULL UNIQUE,
  -- rythme d'alternance : semaine/semaine, l'organisateur a les enfants
  -- la semaine qui commence à rhythm_start (date ISO), changement le jour handover_dow (0 = dimanche)
  rhythm_start TEXT,
  handover_dow INTEGER DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Un proche à prévenir : un rôle. Tant que claim_code existe, il n'a pas rejoint (code à usage unique, effacé ensuite).
-- Une fois rejoint, sa page personnelle est un lien secret dont seule l'empreinte (page_hash) est gardée.
CREATE TABLE IF NOT EXISTS coparents (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  claim_code TEXT UNIQUE,
  claim_expires_at TEXT,
  page_hash TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Appareils abonnés aux notifications (Web Push). L'adresse (endpoint) est un identifiant d'appareil anonyme.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER REFERENCES organizers(id) ON DELETE CASCADE,
  coparent_id INTEGER REFERENCES coparents(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((organizer_id IS NULL) != (coparent_id IS NULL))
);

-- Un enfant peut avoir sa propre page (calendrier en lecture seule), avec le même mécanisme que les proches :
-- code d'invitation à usage unique, puis lien secret dont seule l'empreinte est gardée.
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  claim_code TEXT,
  claim_expires_at TEXT,
  page_hash TEXT
);

CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  coparent_id INTEGER NOT NULL REFERENCES coparents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pickup', 'swap')),
  date TEXT NOT NULL,          -- AAAA-MM-JJ
  time TEXT,                   -- HH:MM (récupération)
  place TEXT,
  items TEXT NOT NULL DEFAULT '[]',          -- objets envoyés dans la notification (JSON)
  private_items TEXT NOT NULL DEFAULT '[]',  -- objets de santé, jamais envoyés (JSON)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'counter', 'declined', 'cancelled')),
  counter_label TEXT,
  counter_choice TEXT,
  responded_at TEXT,
  reminder_sent_at TEXT,
  reminder_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS change_children (
  change_id INTEGER NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  PRIMARY KEY (change_id, child_id)
);

-- Journal des notifications envoyées (aucune adresse d'appareil).
CREATE TABLE IF NOT EXISTS notif_log (
  id INTEGER PRIMARY KEY,
  kind TEXT,                   -- ask | reminder | answer | cancel | confirm
  audience TEXT NOT NULL CHECK (audience IN ('organizer', 'coparent')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  change_id INTEGER REFERENCES changes(id) ON DELETE SET NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_children_claim ON children(claim_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_children_page ON children(page_hash);
CREATE INDEX IF NOT EXISTS idx_notif_change ON notif_log(change_id, id);
CREATE INDEX IF NOT EXISTS idx_changes_org_date ON changes(organizer_id, date);
CREATE INDEX IF NOT EXISTS idx_push_org ON push_subscriptions(organizer_id);
CREATE INDEX IF NOT EXISTS idx_push_coparent ON push_subscriptions(coparent_id);
`;

export function openDb(file = process.env.DATABASE_FILE || 'deux-toits.sqlite') {
  const db = new DatabaseSync(file);
  // Anciens formats (prénoms, e-mails, numéros de téléphone) : pas de migration automatique, on ne devine pas les rôles.
  const legacy = db.prepare(`SELECT 1 FROM pragma_table_info('organizers') WHERE name IN ('email', 'name', 'phone')
                             UNION SELECT 1 FROM sqlite_master WHERE name = 'sms_log'`).get();
  if (legacy) {
    throw new Error(`${file} contient un ancien format (noms, e-mails ou numéros de téléphone). Supprimez ce fichier, ou choisissez un autre DATABASE_FILE, pour repartir sur le format sans données personnelles.`);
  }
  // Bases créées avant les pages enfants : ajout des colonnes (SQLite n'accepte pas UNIQUE dans ALTER, d'où les index).
  const hasChildren = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'children'").get();
  if (hasChildren && !db.prepare("SELECT 1 FROM pragma_table_info('children') WHERE name = 'claim_code'").get()) {
    for (const col of ['claim_code TEXT', 'claim_expires_at TEXT', 'page_hash TEXT']) db.exec(`ALTER TABLE children ADD COLUMN ${col}`);
  }
  db.exec(SCHEMA);
  return db;
}
