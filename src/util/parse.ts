import { parseSyml } from "@yarnpkg/parsers";
import * as yaml from "js-yaml";

abstract class LockParser {
    abstract getDependencies(): Record<string, string[]>;
    constructor(content: string) {}

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
}

export class PnpmLockParser extends LockParser {
    private yaml: any;
    constructor(content: string) {
        super(content);
        this.yaml = yaml.load(content) as any;
    }

    public getDependencies(): Record<string, string[]> {
        const r: Record<string, string[]> = Object.create(null);
        if (!this.yaml.packages) {
            return r;
        }
        Object.entries(this.yaml.packages).forEach(([pkgKey, pkgInfo]) => {
            // 解析包键，格式如: "/lodash/4.17.21" 或 "lodash@4.17.21"
            let name, version;

            if (pkgKey.startsWith("/")) {
                // 旧格式: /lodash/4.17.21
                const parts = pkgKey.split("/");
                name = parts[1];
                version = parts[2];
            } else {
                // 新格式: lodash@4.17.21
                const match = pkgKey.match(/^(.+?)@(.+)$/);
                if (match) {
                    name = match[1];
                    version = match[2];
                }
            }

            if (name && version) {
                // 处理 peer dependency 后缀，如 "babel-jest@27.5.1(@babel/core@7.23.6)"
                let cleanVersion = version.split("(")[0];
                if (cleanVersion == null) {
                    cleanVersion = version;
                }
                if (!r[name]) {
                    r[name] = [];
                }
                if (r[name]!.indexOf(cleanVersion) === -1) {
                    r[name]!.push(cleanVersion);
                }
            }
        });
        return r;
    }
}

export class YarnLockParser extends LockParser {
    private syml: any;

    constructor(content: string) {
        super(content);
        this.syml = parseSyml(content);
    }
    private static getPackageName(key: string): string {
        key = key.split(",")[0]!.trim();
        key = key.split(":")[0]!.trim();
        return key.lastIndexOf("@") > 0
            ? key.slice(0, key.lastIndexOf("@"))
            : key;
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
