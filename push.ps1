param([string]$m = "Update")
git add .
git status --short
git commit -m $m
git push
