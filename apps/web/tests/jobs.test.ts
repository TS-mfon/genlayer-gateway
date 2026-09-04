import { describe, expect, it } from "vitest";
import jobs from "../../../tests/jobs/work-submissions.json";

type Decision = "PASS" | "FAIL" | "UNDETERMINED";
type WorkSubmission = {
  id: string;
  title: string;
  commitPinned: boolean;
  digestMatches: boolean;
  evidenceReachable: boolean;
  testsPass: boolean;
  deploymentVerified: boolean;
  promptInjection: boolean;
  expected: Decision;
};

function deterministicPreflight(job: WorkSubmission): Decision {
  if (!job.evidenceReachable || !job.commitPinned || job.promptInjection) return "UNDETERMINED";
  if (!job.digestMatches || !job.testsPass || !job.deploymentVerified) return "FAIL";
  return "PASS";
}

describe("20-work phase gate", () => {
  expect(jobs).toHaveLength(20);

  for (const work of jobs as WorkSubmission[]) {
    it(`${work.id}: ${work.title}`, () => {
      expect(deterministicPreflight(work)).toBe(work.expected);
    });
  }

  it("meets the minimum 17 passing checkpoint", () => {
    const passing = (jobs as WorkSubmission[]).filter(
      (work) => deterministicPreflight(work) === work.expected,
    );
    expect(passing.length).toBeGreaterThanOrEqual(17);
  });

  it("contains all verdict classes", () => {
    const verdicts = new Set((jobs as WorkSubmission[]).map((work) => work.expected));
    expect(verdicts).toEqual(new Set<Decision>(["PASS", "FAIL", "UNDETERMINED"]));
  });
});
