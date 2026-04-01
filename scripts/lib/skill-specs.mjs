#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(__dirname, "../..");

function directorySkill(routeName) {
  const sourceDir = join(repoRoot, `caixu-${routeName}`);
  return {
    skillName: `caixu-${routeName}`,
    managedDirName: routeName,
    routeName,
    sourceDir,
    skillFile: join(sourceDir, "SKILL.md"),
    packageType: "directory"
  };
}

export const skillSpecs = [
  {
    skillName: "caixu-skill",
    managedDirName: "caixu-skill",
    routeName: "caixu-skill",
    sourceDir: repoRoot,
    skillFile: join(repoRoot, "SKILL.md"),
    packageType: "root"
  },
  directorySkill("ingest-materials"),
  directorySkill("build-asset-library"),
  directorySkill("maintain-asset-library"),
  directorySkill("query-assets"),
  directorySkill("check-lifecycle"),
  directorySkill("build-package"),
  directorySkill("submit-demo")
];

export const expectedSkillNames = skillSpecs.map((spec) => spec.managedDirName);

export function listableSkillNames(spec) {
  return spec.skillName === spec.managedDirName
    ? [spec.skillName]
    : [spec.managedDirName, spec.skillName];
}
