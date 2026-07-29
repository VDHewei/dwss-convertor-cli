---
name: git-cc
description: Collects changes, summarizes the description of corresponding tasks / operations, and automatically executes git commit 
---

Please help me directly execute the following project command chain:
1. Run `git status` to check if there are files not added to the working area, ask whether to add them (add them and run `git add corresponding file/file list` if yes, skip otherwise).
2. First, summarize this session / task + git diff summary of changes content -> $content (output in Chinese, actual commit in English)
3. Run `git commit $content` (output in Chinese, actual commit in English)
4. If there are errors in the command, please help the Agent fix them.
5. After fixing, restart executing from the step where the error occurred.
6. Exit after execution is completed.