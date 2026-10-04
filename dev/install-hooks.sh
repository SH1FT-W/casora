#!/bin/sh
# Richtet den pre-commit-Hook ein: tools/privacy-check.py prüft jeden Commit.
cd "$(dirname "$0")/.."
cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
exec python3 tools/privacy-check.py --staged
HOOK
chmod +x .git/hooks/pre-commit
echo "pre-commit-Hook eingerichtet"
