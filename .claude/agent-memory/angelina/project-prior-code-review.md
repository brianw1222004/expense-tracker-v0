---
name: project-prior-code-review
description: CODE_REVIEW.md is an authoritative prior review — check it before re-reporting bugs
metadata:
  type: reference
---

`expense-tracker/CODE_REVIEW.md` holds a thorough prior review (dated 2026-06-23, "13-dimension reviewer + adversarial verification, 36 agents"). At that time: 242/242 Jest tests pass, web export clean.

**Why:** it already enumerates the known bugs so I should cross-reference rather than re-discover-and-re-report as if novel.

**How to apply:** before flagging a sync/correctness bug, check whether it's already one of its findings (H1=delete-from-edit-popup leaves popup open + Save resurrects; M1/F8=concurrent-pull race no version guard; L1/F1=settings-error aborts whole pull; L2/F9=failed replace op wedges lane; L3/F2=enqueue side effect inside setSettings updater; L4=income hero all-time vs delta month label). Attribute/extend rather than claim as new.
