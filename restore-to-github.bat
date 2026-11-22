@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title LTT BD — Push Project to GitHub
echo ============================================================================
echo   LTT BD — PUSH SOURCE TO GITHUB REPOSITORY
echo ============================================================================
echo.

where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Download Git for Windows from https://git-scm.com/download/win and try again.
    pause
    exit /b 1
)

for /f "delims=" %%N in ('git config --get user.name 2^>nul') do set "GIT_NAME=%%N"
for /f "delims=" %%E in ('git config --get user.email 2^>nul') do set "GIT_EMAIL=%%E"

if "%GIT_NAME%"=="" (
    echo [SETUP] Git author name is not configured on this PC.
    set /p GIT_NAME="Enter your name for Git commits (e.g. Shariful Islam): "
    if not "%GIT_NAME%"=="" git config --global user.name "%GIT_NAME%"
)

if "%GIT_EMAIL%"=="" (
    echo [SETUP] Git author email is not configured on this PC.
    set /p GIT_EMAIL="Enter your GitHub email address: "
    if not "%GIT_EMAIL%"=="" git config --global user.email "%GIT_EMAIL%"
)

if not exist ".git" (
    echo [INFO] Initializing local Git repository on branch main...
    git init
    git branch -M main
) else (
    git branch -M main >nul 2>nul
)

set "CURRENT_REMOTE="
for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%R"

if not "%CURRENT_REMOTE%"=="" (
    echo [INFO] Current GitHub remote: %CURRENT_REMOTE%
    set /p REPO_URL="Press Enter to keep this URL, or paste a new repository URL: "
    if "%REPO_URL%"=="" set "REPO_URL=%CURRENT_REMOTE%"
) else (
    set /p REPO_URL="Enter your private GitHub repository URL (e.g. https://github.com/YOUR_USERNAME/ltt-bd.git): "
)

if "%REPO_URL%"=="" (
    echo [ERROR] Repository URL cannot be empty.
    pause
    exit /b 1
)

git remote remove origin >nul 2>nul
git remote add origin "%REPO_URL%"

echo [INFO] Staging project files (.env.local, data/, and logs are automatically ignored)...
git add -A

git diff --cached --quiet
if %ERRORLEVEL% equ 0 (
    echo [INFO] No new changes to commit.
) else (
    set /p COMMIT_MSG="Commit message (press Enter for default): "
    if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Prepare LTT BD PWA v3.1.0 for GitHub"
    git commit -m "%COMMIT_MSG%"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Git commit failed. Please check the message above.
        pause
        exit /b 1
    )
)

echo [INFO] Pushing to %REPO_URL% (main branch)...
git push -u origin main
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Push failed. Common reasons:
    echo   1. GitHub authentication prompt was cancelled or needs sign-in.
    echo   2. The GitHub repository was created with a README or LICENSE already in it.
    echo      If the remote repo is not empty, run:
    echo      git pull origin main --allow-unrelated-histories
    echo      git push -u origin main
    pause
    exit /b 1
)

echo.
echo [OK] Project pushed successfully to %REPO_URL%
pause
