# GitHub and GitLab large-diff review behavior

Research input for WF-007. Sources are first-party documentation current at the time of the blueprint session.

## Findings

### GitHub

- GitHub bounds pull-request, commit, and compare diffs. Its documented pull-request limits include 20,000 loadable lines or 1 MB of raw diff data, 300 files in one diff, and 25 renderable files. A single file automatically loads only up to 400 lines and 20 KB. When a diff is limited, GitHub may display some portions while not showing content beyond the limit.
- GitHub keeps file-by-file review progress. A reviewer can mark a file **Viewed**, which collapses it and contributes to a progress bar. If that file changes, GitHub automatically removes its viewed status.
- For supported non-code formats, GitHub may provide a specialized renderer. When a rich prose diff cannot be produced, its documentation directs the reviewer to the source view instead.

Sources:

- [GitHub Docs — Repository limits: Diff limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits#diff-limits)
- [GitHub Docs — Reviewing proposed changes: Marking a file as viewed](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request#marking-a-file-as-viewed)
- [GitHub Docs — Working with non-code files](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files)

### GitLab

- GitLab preserves file navigation while degrading large diffs per file. Files with many changes are collapsed with **Some changes are not shown** and can be expanded when they remain below the hard limit.
- GitLab uses a two-stage limit: reaching 10% of configured maximum patch size, file count, or changed-line count collapses files; exceeding a maximum marks diffs **Too large**, and they cannot be expanded in the UI.
- Generated files are collapsed by default but can be expanded. GitLab also supports one-file-at-a-time review for large merge requests.
- GitLab tracks **Viewed** per file. A viewed file returns when its contents change or the reviewer clears the status.

Sources:

- [GitLab Docs source — View changes in merge requests](https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/user/project/merge_requests/changes.md)
- [GitLab Docs source — Diff limits administration](https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/administration/diff_limits.md)
- [GitLab Docs source — Instance limits: Merge request diff limits](https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/administration/instance_limits.md#diff-limits)

## Product implication for Neoflow

The shared interaction pattern is more useful than either service’s exact numeric limits:

1. preserve the complete changed-file manifest and navigation;
2. degrade at file granularity instead of rejecting the whole Review;
3. collapse expensive or generated content by default and expand it on demand within hard resource bounds;
4. label content that cannot be rendered rather than silently dropping it;
5. track viewed state per exact file content and clear that state when the content changes; and
6. offer an external/source path for content Neoflow cannot render.

GitHub and GitLab use review progress as information, not proof that every change was semantically reviewed. Neoflow should likewise preserve exact coverage in its Review Result without claiming that viewed status establishes correctness.
