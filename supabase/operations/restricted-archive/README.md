# Restricted SQL archive

Do not execute SQL in this directory during routine staging setup, tests, or rollback.
The archived booking recovery script restores unsafe customer booking writes and
removes the guarded cancellation RPC. It is retained only as historical evidence;
it is not a test or supported recovery procedure.
