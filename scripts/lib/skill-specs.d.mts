export type SkillSpec = {
  skillName: string;
  managedDirName: string;
  routeName: string;
  sourceDir: string;
  skillFile: string;
  packageType: "root" | "directory";
};

export const repoRoot: string;
export const skillSpecs: SkillSpec[];
export const expectedSkillNames: string[];
export function listableSkillNames(spec: SkillSpec): string[];
