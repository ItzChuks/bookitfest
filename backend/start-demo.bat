@echo off
REM Starts PocketBase with demo data. Put pocketbase.exe in this folder first.
set BKF_DEMO=1
set BKF_SIMULATE_PAYMENTS=1
pocketbase.exe serve
