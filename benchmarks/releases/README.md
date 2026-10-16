# Release snapshots

No release snapshot has been recorded yet. Development measurements live in `../snapshots/`.

At release preparation:

1. Run the package tests against the clean, intended release source. Use the fixed CI environment when a hosted baseline is needed.
2. Run the benchmark with output outside the checkout so creating the result does not itself mark the source dirty:

   ```bash
   npm run --silent benchmark -- --json > /tmp/sheriff-release.json
   npm run --silent benchmark:report -- /tmp/sheriff-release.json
   ```

3. Check `source.commit`, `source.dirty === false`, package version, runtime/harness hashes, and environment. Keep the measured source unchanged during the run. Do not relabel an uncommitted development run as a release measurement.
4. Copy the verified JSON here as `<version>-<commit-prefix>-<platform>-<arch>.json`, preserving the source commit in the result even though the later documentation commit will differ. Alternatively, copy `current.json` from a verified CI run for that release source before its artifact expires.
5. Refresh the root README's benchmark table from the JSON median values. Include the snapshot link, date, environment, sample count, and measured source revision. Submit the snapshot and README update together for review.

Keep prior release files. Compare two releases by rerunning their code using one harness on one machine; historical snapshots with different environments or harness hashes are not directly comparable. Publication and Git operations remain separate from recording benchmark results.
