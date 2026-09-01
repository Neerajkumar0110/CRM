-- ─────────────────────────────────────────────────────────────────────────
--  CRM ⇄ VICIdial correlation columns.  Run ONCE against the VICIdial DB
--  (default name: asterisk) AFTER backing it up (Phase 2).
--
--    mysqldump asterisk > /opt/telephony/backups/asterisk_$(date +%F).sql
--    mysql asterisk < /opt/telephony/vicidial/correlation.sql
--
--  MySQL/MariaDB has no "ADD COLUMN IF NOT EXISTS" in all versions, so this
--  script guards each ALTER with a check. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

DELIMITER $$

DROP PROCEDURE IF EXISTS crm_add_col $$
CREATE PROCEDURE crm_add_col(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END $$

DROP PROCEDURE IF EXISTS crm_add_idx $$
CREATE PROCEDURE crm_add_idx(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(128))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END $$

DELIMITER ;

CALL crm_add_col('vicidial_list', 'crm_lead_id',  'crm_lead_id VARCHAR(32) NULL');
CALL crm_add_col('vicidial_list', 'crm_call_id',  'crm_call_id VARCHAR(32) NULL');
CALL crm_add_idx('vicidial_list', 'crm_lead_id_idx', '`crm_lead_id`');

-- vicidial_log / vicidial_closer_log already carry uniqueid + lead_id +
-- campaign_id; that's enough to join CRM events. Optionally tag the call log:
CALL crm_add_col('vicidial_log', 'crm_call_id', 'crm_call_id VARCHAR(32) NULL');
CALL crm_add_idx('vicidial_log', 'crm_call_id_idx', '`crm_call_id`');

DROP PROCEDURE IF EXISTS crm_add_col;
DROP PROCEDURE IF EXISTS crm_add_idx;

SELECT 'correlation columns ready' AS status;
