import { parseSyml } from "@yarnpkg/parsers";

export class YarnLockParser {
    private syml: any;

    constructor(content: string) {
        this.syml = parseSyml(content);
    }
    private static getPackageName(key: string): string {
        key = key.split(",")[0]!.trim();
        key = key.split(":")[0]!.trim();
        return key.lastIndexOf("@") > 0
            ? key.slice(0, key.lastIndexOf("@"))
            : key;
    }

    public static deps2Set(deps: Record<string, string[]>): Set<string> {
        const r = new Set<string>();
        for (const key in deps) {
            const versions = deps[key]!;
            for (let i = 0; i < versions.length; i++) {
                r.add(`${key}@${versions[i]}`);
            }
        }
        return r;
    }

    public getDependencies(): Record<string, string[]> {
        const r: Record<string, string[]> = Object.create(null);
        for (const key in this.syml) {
            const entry = this.syml[key];
            if (entry === "__metadata") {
                continue;
            }

            const pkgName = YarnLockParser.getPackageName(key);
            if (!r[pkgName]) {
                r[pkgName] = [];
            }

            if (r[pkgName].indexOf(entry.version) === -1) {
                r[pkgName].push(entry.version);
            }
        }

        return r;
    }
}
