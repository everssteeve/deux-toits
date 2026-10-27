// Base de données SQLite intégrée à Node (node:sqlite), sans dépendance native.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

-- Aucun nom, prénom ni e-mail d'adulte : un adulte est un rôle (Papa, Maman…) et un numéro.
-- L'organisateur se reconnecte avec un code d'accès, conservé uniquement sous forme d'empreinte.
CREATE TABLE IF NOT EXISTS organizers (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL,
  phone TEXT NOT NULL,
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

-- Un proche à prévenir : son numéro est vide tant qu'il n'a pas utilisé son code d'invitation
-- (page /j, QR code, ou SMS contenant le code). Le code est effacé dès l'enregistrement.
CREATE TABLE IF NOT EXISTS coparents (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  phone TEXT,
  claim_code TEXT UNIQUE,
  claim_expires_at TEXT,
  opted_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY,
  organizer_id INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  coparent_id INTEGER NOT NULL REFERENCES coparents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pickup', 'swap')),
  date TEXT NOT NULL,          -- AAAA-MM-JJ
  time TEXT,                   -- HH:MM (récupération)
  place TEXT,
  items TEXT NOT NULL DEFAULT '[]',          -- objets envoyés dans le SMS (JSON)
  private_items TEXT NOT NULL DEFAULT '[]',  -- objets de santé, jamais envoyés par SMS (JSON)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'counter', 'declined', 'cancelled')),
  counter_label TEXT,
  counter_choice TEXT,
  token TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS sms_log (
  id INTEGER PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  kind TEXT,                   -- ask | reminder | answer | cancel | confirm | system
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  change_id INTEGER REFERENCES changes(id) ON DELETE SET NULL,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Désinscriptions STOP : par numéro, valables pour tous les organisateurs.
CREATE TABLE IF NOT EXISTS opt_outs (
  phone TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_log(phone, id);
CREATE INDEX IF NOT EXISTS idx_changes_org_date ON changes(organizer_id, date);
CREATE INDEX IF NOT EXISTS idx_coparents_phone ON coparents(phone);
`;

export function openDb(file = process.env.DATABASE_FILE || 'deux-toits.sqlite') {
  const db = new DatabaseSync(file);
  // Ancienne version (prénoms et e-mails en base) : pas de migration automatique, on ne devine pas les rôles.
  const legacy = db.prepare("SELECT 1 FROM pragma_table_info('organizers') WHERE name IN ('email', 'name')").get();
  if (legacy) {
    throw new Error(`${file} contient l'ancien format (noms et e-mails). Supprimez ce fichier, ou choisissez un autre DATABASE_FILE, pour repartir sur le format sans données nominatives.`);
  }
  db.exec(SCHEMA);
  return db;
}
