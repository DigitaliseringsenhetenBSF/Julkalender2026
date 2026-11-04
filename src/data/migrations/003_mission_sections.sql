-- Missions get the structure of the campaign owner's texts (SPEC §5.2a):
-- "Gör så här" (how_to, formerly description), "Om du vill" (if_you_want) and an icon file.
ALTER TABLE missions RENAME COLUMN description TO how_to;
ALTER TABLE missions ADD COLUMN if_you_want text NOT NULL DEFAULT '';
ALTER TABLE missions ADD COLUMN icon text NOT NULL DEFAULT '';
