import { type PRScanResult } from '../tool/prscan.js';
import got from 'got';

export function makeReportInMd(sr: PRScanResult): {
    report: string;
    abstract: string;
} {
    const risksCount = sr.changedDeps.reduce((acc, dep) => acc + dep.risks.length, 0);
    let abstract = "共有 " + sr.changedDeps.length + " 个依赖变更, 包含 " + risksCount + " 个风险";

    let md = "# PR扫描结果\n";
    md += `## 依赖变更\n\n`;
    if (sr.changedDeps.length === 0) {
        md += "无依赖变更\n";
    } else {
        
        md += "| 依赖 | 版本 | 风险 | 下载 | 周下载量 | 最新版 |\n";
        md += "|:---- |:---- |:---- |:---- |:---- |:---- |\n";
        const depSorted = sr.changedDeps.sort((a, b) => b.risks.length - a.risks.length);
        for (const dep of depSorted) {
            md += `| ${dep.name} | ${dep.version} | ${dep.risks.length} | ${dep.packageInfo.versions[dep.version]!.dist.tarball} | ${dep.downloadInfo.downloads} | ${dep.packageInfo["dist-tags"].latest} |\n`;
        }
        md += "\n\n";

        md += "\n## 详细风险信息\n\n";
        for (const dep of depSorted) {
            if (dep.risks.length === 0) {
                continue;
            }
            md += `### ${dep.name} @ ${dep.version}\n\n`;
            for (const risk of dep.risks) {
                md += `- **【${risk.level === "low" ? "低危" : (risk.level === "medium" ? "中危" : "高危")}】** ${risk.desc}:\n\n\`\`\`\n${risk.info}\n\`\`\`\n\n`;
            }
            md += "\n";
        }
    }

    return {
        report: md,
        abstract
    }
}

export async function md2Img(md: string): Promise<Buffer | null> {
    try {
        return (await got(`https://readpo.com/p/${encodeURIComponent(md)}`)).rawBody;
    } catch {
        return null;
    }
}