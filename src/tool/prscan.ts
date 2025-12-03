import { analyzeGlobals, type GlobalUsageMap } from "../util/analyze.js";
import {
    getNpmPackageDownloadStats,
    getNpmPackageInfo,
    type NpmDownloadStats,
    type NpmPackageInfo,
} from "../util/npm.js";
import { YarnLockParser, PnpmLockParser } from "../util/parse.js";

import { GitHubRepo } from "../util/repo.js";

import semver from "semver";
import { parse } from "@babel/parser";
import { extractTarGzFromBuffer } from "../util/memory-archive.js";
import type { Pack } from "tar-stream";

import got from "got";

export interface RelatedPackage {
    package: NpmPackageInfo;
    downloadInfo: NpmDownloadStats;
}

export abstract class BaseRisk {
    abstract desc: string;
    abstract level: "low" | "medium" | "high";
    public package: RelatedPackage;
    public info: string;

    constructor(pkg: RelatedPackage, info: string) {
        this.package = pkg;
        this.info = info;
    }
}

export class VersionRisk extends BaseRisk {
    public desc: string = "使用了最新或最近发布的版本";
    public level: "low" | "medium" | "high" = "low";

    static build(pkg: RelatedPackage, version: string): VersionRisk | null {
        const latestVersion = pkg.package["dist-tags"].latest;
        if (semver.eq(version, latestVersion)) {
            const publishedTime = pkg.package.time[latestVersion];
            if (publishedTime) {
                const isRecent =
                    Date.now() - new Date(publishedTime).getTime() <
                    1000 * 60 * 60 * 24 * 30; // 30天
                if (isRecent) {
                    return new VersionRisk(
                        pkg,
                        `${pkg.package.name} 使用了最新版本: ${version}, 且该版本为30天内发布`
                    );
                }
            }
        }

        // if (version in pkg.package.time) {
        //     const publishedTime = pkg.package.time[version];
        //     if (publishedTime) {
        //         const isRecent =
        //             Date.now() - new Date(publishedTime).getTime() <
        //             1000 * 60 * 60 * 24 * 30; // 30天
        //         if (isRecent) {
        //             return new VersionRisk(
        //                 pkg,
        //                 `${pkg.package.name} 使用了30天内发布的版本: ${version}`
        //             );
        //         }
        //     }
        // }
        return null;
    }
}

export class NotWidelyUsedRisk extends BaseRisk {
    public desc: string = "使用了不常用的NPM包";
    public level: "low" | "medium" | "high" = "medium";

    static build(pkg: RelatedPackage): NotWidelyUsedRisk | null {
        if (pkg.downloadInfo.downloads < 10000) {
            return new NotWidelyUsedRisk(
                pkg,
                `${pkg.package.name}在${pkg.downloadInfo.start} - ${pkg.downloadInfo.end}期间下载量仅有 ${pkg.downloadInfo.downloads} 次`
            );
        }
        return null;
    }
}

type RiskRecord = Record<
    string,
    {
        perm: "r" | "rw";
        type:
            | "网络请求"
            | "操作DOM"
            | "动态执行代码"
            | "读取本地储存"
            | "访问chrome扩展API";
        desc: string;
    }
>;
export class RiskyGlobalUsageRisk extends BaseRisk {
    desc: string = "使用了危险的全局变量";
    level: "low" | "medium" | "high" = "high";

    public globals: RiskRecord;

    constructor(pkg: RelatedPackage, info: string, globals: RiskRecord) {
        super(pkg, info);
        this.globals = globals;
    }

    static build(pkg: RelatedPackage, globals: Record<string, "r" | "rw">) {
        const records: RiskRecord = Object.create(null);

        const networkGlobals = [
            "fetch",
            "XMLHttpRequest",
            "ActiveXObject",
            "WebSocket",
            "EventSource",
            "navigator",
            "Image",
            "Script",
        ];
        const domGlobals = ["document", "window", "addEventListener"];
        const domCallbacks = [
            "onsearch",
            "onappinstalled",
            "onbeforeinstallprompt",
            "onbeforexrselect",
            "onabort",
            "onbeforeinput",
            "onbeforematch",
            "onbeforetoggle",
            "onblur",
            "oncancel",
            "oncanplay",
            "oncanplaythrough",
            "onchange",
            "onclick",
            "onclose",
            "oncommand",
            "oncontentvisibilityautostatechange",
            "oncontextlost",
            "oncontextmenu",
            "oncontextrestored",
            "oncuechange",
            "ondblclick",
            "ondrag",
            "ondragend",
            "ondragenter",
            "ondragleave",
            "ondragover",
            "ondragstart",
            "ondrop",
            "ondurationchange",
            "onemptied",
            "onended",
            "onerror",
            "onfocus",
            "onformdata",
            "oninput",
            "oninvalid",
            "onkeydown",
            "onkeypress",
            "onkeyup",
            "onload",
            "onloadeddata",
            "onloadedmetadata",
            "onloadstart",
            "onmousedown",
            "onmouseenter",
            "onmouseleave",
            "onmousemove",
            "onmouseout",
            "onmouseover",
            "onmouseup",
            "onmousewheel",
            "onpause",
            "onplay",
            "onplaying",
            "onprogress",
            "onratechange",
            "onreset",
            "onresize",
            "onscroll",
            "onscrollend",
            "onsecuritypolicyviolation",
            "onseeked",
            "onseeking",
            "onselect",
            "onslotchange",
            "onstalled",
            "onsubmit",
            "onsuspend",
            "ontimeupdate",
            "ontoggle",
            "onvolumechange",
            "onwaiting",
            "onwebkitanimationend",
            "onwebkitanimationiteration",
            "onwebkitanimationstart",
            "onwebkittransitionend",
            "onwheel",
            "onauxclick",
            "ongotpointercapture",
            "onlostpointercapture",
            "onpointerdown",
            "onpointermove",
            "onpointerrawupdate",
            "onpointerup",
            "onpointercancel",
            "onpointerover",
            "onpointerout",
            "onpointerenter",
            "onpointerleave",
            "onselectstart",
            "onselectionchange",
            "onanimationend",
            "onanimationiteration",
            "onanimationstart",
            "ontransitionrun",
            "ontransitionstart",
            "ontransitionend",
            "ontransitioncancel",
            "onafterprint",
            "onbeforeprint",
            "onbeforeunload",
            "onhashchange",
            "onlanguagechange",
            "onmessage",
            "onmessageerror",
            "onoffline",
            "ononline",
            "onpagehide",
            "onpageshow",
            "onpopstate",
            "onrejectionhandled",
            "onstorage",
            "onunhandledrejection",
            "onunload",
            "ondevicemotion",
            "ondeviceorientation",
            "ondeviceorientationabsolute",
            "onpageswap",
            "onpagereveal",
            "onscrollsnapchange",
            "onscrollsnapchanging",
        ];
        const codeExecGlobals = ["eval"];
        const localStorageGlobals = [
            "localStorage",
            "sessionStorage",
            "IndexedDB",
            "cookies",
        ];

        for (const [g, perm] of Object.entries(globals)) {
            if (networkGlobals.includes(g)) {
                records[g] = {
                    perm,
                    type: "网络请求",
                    desc: "发起网络请求, 可能包含恶意行为",
                };
            } else if (
                domGlobals.includes(g) ||
                (domCallbacks.includes(g) && perm === "rw")
            ) {
                records[g] = {
                    perm,
                    type: "操作DOM",
                    desc: "可能读取用户助记词等敏感信息",
                };
            } else if (codeExecGlobals.includes(g)) {
                records[g] = {
                    perm,
                    type: "动态执行代码",
                    desc: "可能会执行恶意代码",
                };
            } else if (localStorageGlobals.includes(g)) {
                records[g] = {
                    perm,
                    type: "读取本地储存",
                    desc: "可能会读取用户的本地储存数据",
                };
            } else if (g === "chrome") {
                records[g] = {
                    perm,
                    type: "访问chrome扩展API",
                    desc: "访问chrome扩展API",
                };
            }
        }

        if (Object.keys(records).length === 0) {
            return null;
        }

        let info = "";
        for (const [g, { perm, type, desc }] of Object.entries(records)) {
            info += `- ${
                perm === "r" ? "访问" : "读写"
            } ${g} (${type}): ${desc}\n`;
        }

        return new RiskyGlobalUsageRisk(pkg, info.trim(), records);
    }
}

export class ObfuscationRisk extends BaseRisk {
    public desc: string = "代码经过混淆";
    public level: "low" | "medium" | "high" = "medium";

    static build(
        pkg: RelatedPackage,
        files: Record<string, string>
    ): ObfuscationRisk | null {
        let hit = false;
        let info = "";

        // 被混淆过的代码有如下特征
        // 1. 包含特定混淆关键字，如 while(!![]), +-parseInt(
        // 2. 包含典型混淆变量名，如 _0xabc123
        const obfsKeywords = ["while(!![])", "+-parseInt("];
        const obfsIdentifier = /_0x[0-9a-fA-F]{6}/;
        for (const [file, content] of Object.entries(files)) {
            if (obfsKeywords.some((kw) => content.includes(kw))) {
                hit = true;
            } else if (obfsIdentifier.test(content)) {
                hit = true;
            }

            info += `- ${file} 被混淆\n`;
        }

        return hit ? new ObfuscationRisk(pkg, info.trim()) : null;
    }
}

export class RuleRisk extends BaseRisk {
    public desc: string = "触发关键字规则";
    public level: "low" | "medium" | "high" = "low";

    static build(
        pkg: RelatedPackage,
        files: Record<string, string>
    ): RuleRisk | null {
        let info = "";
        let hit = false;
        for (const [file, content] of Object.entries(files)) {
            if (content.includes("ethereum")) {
                info += `- ${file} 使用了 ethereum\n`;
                hit = true;
            }
        }
        return hit ? new RuleRisk(pkg, info.trim()) : null;
    }
}

export type Risk =
    | VersionRisk
    | NotWidelyUsedRisk
    | RiskyGlobalUsageRisk
    | ObfuscationRisk
    | RuleRisk;

export interface PRScanResult {
    changedDeps: Array<{
        name: string;
        version: string;
        packageInfo: NpmPackageInfo;
        downloadInfo: NpmDownloadStats;
        analyze: {
            global: GlobalUsageMap;
        };
        risks: Risk[];
    }>;
}

export async function scanPkgRisks(
    name: string,
    version: string
): Promise<{
    risks: Risk[];
    package: NpmPackageInfo;
    downloadInfo: NpmDownloadStats;
    globalUsage: GlobalUsageMap;
}> {
    console.info(`Scanning ${name}@${version} ...`);
    // 获取NPM包信息
    const packageInfo = await getNpmPackageInfo(name);
    if (packageInfo === null) {
        throw new Error(`Failed to fetch package info for ${name}`);
    }

    if (!packageInfo.versions[version]) {
        throw new Error(
            `Version ${version} of package ${name} not found in registry`
        );
    }

    // 获取下载统计信息
    const downloadInfo = await getNpmPackageDownloadStats(name, "last-week");
    if (downloadInfo === null) {
        throw new Error(`Failed to fetch download stats for ${name}`);
    }

    // 下载包文件
    console.info(`Downloading tarball for ${name}@${version}`);
    const tarballUrl = packageInfo.versions[version]!.dist.tarball;
    const tarballResponse = await got(tarballUrl);
    if (tarballResponse.statusCode !== 200) {
        throw new Error(
            `Failed to download tarball for ${name}@${version}: ${tarballResponse.statusMessage}`
        );
    }

    const tarballBuffer = tarballResponse.rawBody;

    const files = await extractTarGzFromBuffer(tarballBuffer, {
        filter: (path) => path.endsWith(".js"),
    });
    const fileMap: Record<string, string> = Object.create(null);

    for (const file of files) {
        fileMap[file.path] = file.content.toString("utf8");
    }

    // 分析代码
    let globalUsage: GlobalUsageMap = Object.create(null);
    for (const [file, content] of Object.entries(fileMap)) {
        try {
            const usage = analyzeGlobals(content);
            for (const [g, perm] of Object.entries(usage)) {
                if (g in globalUsage) {
                    if (perm === "rw" || globalUsage[g] === "rw") {
                        globalUsage[g] = "rw";
                    }
                } else {
                    globalUsage[g] = perm;
                }
            }
        } catch (e) {
            console.warn(`Failed to analyze ${name}@${version} - ${file}:`, e);
        }
    }

    const risks: Risk[] = [];

    const relatedPkg: RelatedPackage = {
        package: packageInfo,
        downloadInfo: downloadInfo,
    };

    const vRisk = VersionRisk.build(relatedPkg, version);
    if (vRisk) risks.push(vRisk);

    const uRisk = NotWidelyUsedRisk.build(relatedPkg);
    if (uRisk) risks.push(uRisk);

    const gRisk = RiskyGlobalUsageRisk.build(relatedPkg, globalUsage);
    if (gRisk) risks.push(gRisk);

    const oRisk = ObfuscationRisk.build(relatedPkg, fileMap);
    if (oRisk) risks.push(oRisk);

    const rRisk = RuleRisk.build(relatedPkg, fileMap);
    if (rRisk) risks.push(rRisk);

    return {
        risks,
        package: packageInfo,
        downloadInfo: downloadInfo,
        globalUsage: globalUsage,
    };
}

export async function scanByFileDiff(
    files: Array<{
        filename: string;
        oldContent: string;
        newContent: string;
    }>
) {
    let changedDeps: Set<string> = new Set();
    const sr: PRScanResult = {
        changedDeps: [],
    };
    for (const file of files) {
        if (file.filename.endsWith("pnpm-lock.yaml")) {
            const p1 = new PnpmLockParser(file.oldContent);
            const p2 = new PnpmLockParser(file.newContent);
            const depsNew = PnpmLockParser.deps2Set(p1.getDependencies());
            const depsOld = PnpmLockParser.deps2Set(p2.getDependencies());

            // 对比集合差异, 寻找变更依赖
            changedDeps = changedDeps.union(depsNew.difference(depsOld));
            continue;
        } else if (file.filename.endsWith("yarn.lock")) {
            const p1 = new YarnLockParser(file.oldContent);
            const p2 = new YarnLockParser(file.newContent);
            const depsNew = YarnLockParser.deps2Set(p1.getDependencies());
            const depsOld = YarnLockParser.deps2Set(p2.getDependencies());

            // 对比集合差异, 寻找变更依赖
            changedDeps = changedDeps.union(depsNew.difference(depsOld));
        }
    }

    for (const dep of changedDeps) {
        const name = dep.slice(0, dep.lastIndexOf("@"));
        const version = dep.slice(dep.lastIndexOf("@") + 1);

        const pkgScan = await scanPkgRisks(name, version);
        sr.changedDeps.push({
            name,
            version,
            packageInfo: pkgScan.package,
            downloadInfo: pkgScan.downloadInfo,
            analyze: {
                global: pkgScan.globalUsage,
            },
            risks: pkgScan.risks,
        });
    }

    return sr;
}

export async function scanPRRisks(
    owner: string,
    repo: string,
    pull_no: number,
    auth: string | undefined = undefined
): Promise<PRScanResult | null> {
    const github = new GitHubRepo(auth);
    const prinfo = await github.getPRInfo(owner, repo, pull_no);
    const prfiles = await github.getPRChangedFiles(owner, repo, pull_no, 100);
    if (prinfo === null || prfiles === null) {
        throw new Error(`Failed to fetch PR info or files for #${pull_no}`);
    }

    let changedDeps: Set<string> = new Set();

    const sr: PRScanResult = {
        changedDeps: [],
    };

    for (const file of prfiles) {
        if (file.status === "removed") {
            continue; // 跳过已删除的文件
        }

        if (
            file.filename === "yarn.lock" ||
            file.filename === "pnpm-lock.yaml"
        ) {
            if (file.status !== "added") {
                const yarnNew = await github.getTextFileContent(
                    owner,
                    repo,
                    file.filename,
                    prinfo.head.sha
                );

                const yarnOld = await github.getTextFileContent(
                    owner,
                    repo,
                    file.filename,
                    prinfo.base.sha
                );

                if (yarnNew === null || yarnOld === null) {
                    throw new Error(`Failed to fetch ${file.filename} content`);
                    continue;
                }

                // 构建依赖版本号集合
                const parserNew = new YarnLockParser(yarnNew);
                const parserOld = new YarnLockParser(yarnOld);
                const depsNew = YarnLockParser.deps2Set(
                    parserNew.getDependencies()
                );
                const depsOld = YarnLockParser.deps2Set(
                    parserOld.getDependencies()
                );

                // 对比集合差异, 寻找变更依赖
                changedDeps = changedDeps.union(depsNew.difference(depsOld));
            } else {
                const yarnNew = await github.getTextFileContent(
                    owner,
                    repo,
                    file.filename,
                    prinfo.head.sha
                );

                if (yarnNew === null) {
                    throw new Error(`Failed to fetch ${file.filename} content`);
                    continue;
                }

                // 构建依赖版本号集合
                const parserNew = new YarnLockParser(yarnNew);
                const depsNew = YarnLockParser.deps2Set(
                    parserNew.getDependencies()
                );

                changedDeps = changedDeps.union(depsNew);
            }
        }
    }

    for (const dep of changedDeps) {
        const name = dep.slice(0, dep.lastIndexOf("@"));
        const version = dep.slice(dep.lastIndexOf("@") + 1);

        const pkgScan = await scanPkgRisks(name, version);
        sr.changedDeps.push({
            name,
            version,
            packageInfo: pkgScan.package,
            downloadInfo: pkgScan.downloadInfo,
            analyze: {
                global: pkgScan.globalUsage,
            },
            risks: pkgScan.risks,
        });
    }

    return sr;
}
