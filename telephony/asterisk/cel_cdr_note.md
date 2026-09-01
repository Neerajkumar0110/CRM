# CDR / CEL / recording — what to verify (do NOT overwrite VICIdial's setup)

VICIdial already wires CDR + CEL into its MySQL DB. Don't replace `cdr.conf`,
`cdr_mysql.conf`, `cel.conf`, `cel_odbc.conf` / `cel_custom.conf`. Just confirm:

```bash
asterisk -rx "cdr show status"        # backends should include a MySQL/ODBC sink
asterisk -rx "cel show status"        # CEL enabled, events captured
asterisk -rx "module show like cdr"
asterisk -rx "module show like cel"
```

**Custom field for correlation** — add `crm_call_id` to CDR so every row
links back to the CRM. Two options:

1. `cdr_custom.conf` (CSV):
   ```
   [mappings]
   Master.csv => ${CSV_QUOTE(${CDR(clid)})},${CSV_QUOTE(${CDR(src)})},${CSV_QUOTE(${CDR(dst)})},${CSV_QUOTE(${CDR(disposition)})},${CSV_QUOTE(${CDR(duration)})},${CSV_QUOTE(${CDR(uniqueid)})},${CSV_QUOTE(${CDR(crm_call_id)})}
   ```
2. MySQL: add a `crm_call_id VARCHAR(32)` column to the CDR table and map it
   in `cdr_mysql.conf` / `cdr_adaptive_odbc.conf`:
   ```
   [asterisk]
   ...
   alias crm_call_id => crm_call_id
   ```

The dialplan already sets it: `Set(CDR(crm_call_id)=${CRMCALLID})`
(see `extensions_crm.conf.tpl`).

**Recording**: `MixMonitor(${UNIQUEID}.wav,b)` in the CRM contexts writes to
`RECORDINGS_DIR` (default `/var/spool/asterisk/monitor`). The integration
service reads that dir (path-traversal guarded) and streams files ONLY
through the CRM's authorised proxy. Never make the dir web-accessible.
Confirm:
```bash
asterisk -rx "module show like mixmonitor"
ls -la /var/spool/asterisk/monitor
```
