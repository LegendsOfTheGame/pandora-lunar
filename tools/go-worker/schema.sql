-- One row for each wiki page for each UTC day. Nothing that identifies a visitor.
CREATE TABLE IF NOT EXISTS clicks (
  day    TEXT    NOT NULL,          -- YYYY-MM-DD, UTC
  target TEXT    NOT NULL,          -- wiki page title, spaces as underscores
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, target)
);
