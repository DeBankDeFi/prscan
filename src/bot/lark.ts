// SDK 使用说明 SDK user guide：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/server-side-sdk/nodejs-sdk/preparation-before-development
import http from "http";
import * as lark from "@larksuiteoapi/node-sdk";
import { scanPRRisks } from "../tool/prscan.js";
import { makeReportInMd, md2Img } from "../report/index.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const encryptKey = process.env.key;
const verificationToken = process.env.token;
const appId = process.env.id;
const appSecret = process.env.secret;
const bindPath = process.env.path || "/larkbot/event";
const port = process.env.port || 12345;

console.log("Lark Bot starting...");
console.log("App ID:", appId);
console.log("App Secret:", appSecret);
console.log("Encrypt Key:", encryptKey);
console.log("Verification Token:", verificationToken);
console.log("Event Path:", bindPath);
console.log("Listening on Port:", port);

const client = new lark.Client({
    appId: appId ?? "",
    appSecret: appSecret ?? "",
});

// 注册事件 Register event
const eventDispatcher = new lark.EventDispatcher({
    logger: console,
    loggerLevel: 5,
    encryptKey: encryptKey ?? "",
    verificationToken: verificationToken ?? "",
}).register({
    "im.message.receive_v1": async (data) => {
        if (data.message.message_type !== "text") {
            client.im.message.reply({
                path: {
                    message_id: data.message.message_id,
                },
                data: {
                    content: JSON.stringify({
                        text:
                            "只支持文本消息，收到消息类型：" +
                            data.message.message_type,
                    }),
                    msg_type: "text",
                },
            });
            return "success";
        }

        const msg = JSON.parse(data.message.content).text as any;

        // 提取PR链接
        const prRegex =
            /(https:\/\/github\.com\/[^\s\/]+\/[^\s\/]+\/pull\/\d+)/g;
        const prLinks = msg.match(prRegex);

        if (prLinks == null || prLinks.length === 0) {
            client.im.message.reply({
                path: {
                    message_id: data.message.message_id,
                },
                data: {
                    content: JSON.stringify({ text: "未提取到PR链接" }),
                    msg_type: "text",
                },
            });
            return "success";
        }

        for (const prLink of prLinks) {
            // 提取owner、repo、pr_number
            const match = prLink.match(
                /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
            );
            if (match) {
                const owner = match[1];
                const repo = match[2];
                const prNumber = match[3];

                scanPRRisks(owner, repo, prNumber)
                    .then((result) => {
                        const report = makeReportInMd(result!);

                        client.im.message.reply({
                            path: {
                                message_id: data.message.message_id,
                            },
                            data: {
                                content: JSON.stringify({
                                    zh_cn: {
                                        title: `PR安全扫描结果 - ${owner}/${repo}#${prNumber}`,
                                        content: [
                                            [
                                                {
                                                    tag: "text",
                                                    text: `摘要: ${report.abstract}\n详细结果见下图:`,
                                                },
                                                {
                                                    tag: "md",
                                                    text: report.report,
                                                },
                                            ],
                                        ],
                                    },
                                }),
                                msg_type: "post",
                            },
                        });
                    })
                    .catch((error) => {
                        client.im.message.reply({
                            path: {
                                message_id: data.message.message_id,
                            },
                            data: {
                                content: JSON.stringify({
                                    text: `扫描PR ${prLink} 失败: ${error.message}`,
                                }),
                                msg_type: "text",
                            },
                        });
                    });
            }
        }
        // console.log(data);

        // client.im.message.reply({
        //     path: {
        //       message_id: data.message.message_id,
        //     },
        //     data: {
        //       content: JSON.stringify({"text": "收到消息：" + data.message.text}),
        //       msg_type: "text"
        //     }
        // });
        return "success";
    },
});

const server = http.createServer();
// 创建路由处理器 Create route handler
server.on(
    "request",
    lark.adaptDefault(bindPath, eventDispatcher, {
        autoChallenge: true,
    })
);

server.listen(port);

function createReadStreamFromBuffer(buffer: Buffer, options = {}) {
    // 在系统临时目录创建文件
    const tempDir = os.tmpdir();
    const tempFile = path.join(
        tempDir,
        `buffer-stream-${Date.now()}-${Math.random().toString(36).substr(2)}`
    );

    // 同步写入临时文件
    fs.writeFileSync(tempFile, buffer);

    // 创建 read stream
    const readStream = fs.createReadStream(tempFile, options);

    // 自动清理临时文件
    const cleanup = () => {
        fs.unlink(tempFile, (err) => {
            if (err && err.code !== "ENOENT") {
                console.error("清理临时文件失败:", err);
            }
        });
    };

    readStream.on("close", cleanup);
    readStream.on("error", cleanup);
    readStream.on("end", cleanup);

    return readStream;
}
