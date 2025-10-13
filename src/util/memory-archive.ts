import tarStream from 'tar-stream';
import gunzip from 'gunzip-maybe';
import { Readable } from 'stream';
import got from 'got';

export interface ExtractedFile {
    path: string;
    content: Buffer;
    size: number;
    type: 'file' | 'directory' | 'symlink';
    mode: number;
    mtime: Date;
}

export interface ExtractionOptions {
    /** 只解压匹配的文件路径 */
    filter?: (path: string) => boolean;
    /** 最大文件大小限制 (bytes) */
    maxFileSize?: number;
    /** 最大总解压大小限制 (bytes) */
    maxTotalSize?: number;
}

/**
 * 在内存中解压 .tar.gz Buffer
 */
export async function extractTarGzFromBuffer(
    tarGzBuffer: Buffer,
    options: ExtractionOptions = {}
): Promise<ExtractedFile[]> {
    const { filter, maxFileSize = 50 * 1024 * 1024, maxTotalSize = 500 * 1024 * 1024 } = options;
    const files: ExtractedFile[] = [];
    let totalSize = 0;
    
    return new Promise((resolve, reject) => {
        const extract = tarStream.extract();
        
        extract.on('entry', (header, stream, next) => {
            // 应用过滤器
            if (filter && !filter(header.name)) {
                stream.on('end', next);
                stream.resume();
                return;
            }
            
            // 检查文件大小限制
            if (header.size && header.size > maxFileSize) {
                stream.on('end', next);
                stream.resume();
                console.warn(`File ${header.name} exceeds size limit, skipping`);
                return;
            }
            
            const chunks: Buffer[] = [];
            let fileSize = 0;
            
            stream.on('data', (chunk: Buffer) => {
                fileSize += chunk.length;
                totalSize += chunk.length;
                
                // 检查总大小限制
                if (totalSize > maxTotalSize) {
                    reject(new Error('Total extraction size limit exceeded'));
                    return;
                }
                
                chunks.push(chunk);
            });
            
            stream.on('end', () => {
                if (header.type === 'file') {
                    files.push({
                        path: header.name,
                        content: Buffer.concat(chunks),
                        size: fileSize,
                        type: 'file',
                        mode: header.mode || 0,
                        mtime: header.mtime || new Date()
                    });
                } else if (header.type === 'directory') {
                    files.push({
                        path: header.name,
                        content: Buffer.alloc(0),
                        size: 0,
                        type: 'directory',
                        mode: header.mode || 0,
                        mtime: header.mtime || new Date()
                    });
                }
                next();
            });
            
            stream.on('error', reject);
        });
        
        extract.on('finish', () => {
            resolve(files);
        });
        
        extract.on('error', reject);
        
        // 处理压缩流
        Readable.from(tarGzBuffer)
            .pipe(gunzip())
            .pipe(extract);
    });
}


/**
 * 从URL下载并在内存中解压
 */
export async function extractTarGzFromUrl(
    url: string,
    options: ExtractionOptions = {}
): Promise<ExtractedFile[]> {
    const response = await got(url);
    if (response.statusCode !== 200) {
        throw new Error(`Failed to download: ${response.statusMessage}`);
    }

    const buffer = response.rawBody;
    return extractTarGzFromBuffer(buffer, options);
}

/**
 * 获取特定文件内容
 */
export async function getFileFromTarGz(
    tarGzBuffer: Buffer,
    filePath: string
): Promise<Buffer | null> {
    const files = await extractTarGzFromBuffer(tarGzBuffer, {
        filter: (path) => path === filePath
    });
    
    return files.length > 0 ? files[0]!.content : null;
}

/**
 * 只获取文件列表，不提取内容
 */
export async function listTarGzContents(tarGzBuffer: Buffer): Promise<string[]> {
    const fileList: string[] = [];
    
    return new Promise((resolve, reject) => {
        const extract = tarStream.extract();
        
        extract.on('entry', (header, stream, next) => {
            fileList.push(header.name);
            stream.on('end', next);
            stream.resume(); // 跳过内容读取
        });
        
        extract.on('finish', () => {
            resolve(fileList);
        });
        
        extract.on('error', reject);
        
        Readable.from(tarGzBuffer)
            .pipe(gunzip())
            .pipe(extract);
    });
}

/**
 * 按文件扩展名过滤提取
 */
export async function extractByExtensions(
    tarGzBuffer: Buffer,
    extensions: string[]
): Promise<ExtractedFile[]> {
    const normalizedExts = extensions.map(ext => 
        ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );
    
    return extractTarGzFromBuffer(tarGzBuffer, {
        filter: (path) => {
            const ext = path.toLowerCase().substring(path.lastIndexOf('.'));
            return normalizedExts.includes(ext);
        }
    });
}