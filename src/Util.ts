import fetch from "node-fetch";
import { parse, isAbsolute, resolve } from "path";
import { createWriteStream, readFileSync, writeFileSync } from "fs";
import { Console } from "console";
import { GenerateBaseOptions } from "./ImageResource.js";


const urlRegex = /^(http|https):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(:\d+)?(\/\S*)?$/;
const httpRegex = /^(http|https):\/\/*/;

export const minimumTileSize = (widthOrHeight:number): number => {
    let minimumTileSize = widthOrHeight - (widthOrHeight % 16);
    while (minimumTileSize % 16 == 0 && minimumTileSize > 256) minimumTileSize /= 2;
    return minimumTileSize;
}

export const validatePath = (filePathOrUrl: string | URL): string | false => {

    if (filePathOrUrl instanceof URL) return filePathOrUrl.href;
    else if (urlRegex.test(filePathOrUrl) || httpRegex.test(filePathOrUrl)) return filePathOrUrl;
    else {
        // path points to a local file or directory
        if (isAbsolute(filePathOrUrl)) return filePathOrUrl;
        else {
            // Not an absolute path or URL, return false
            return false;
        }
    }
}
export const resolvePath = (filePathOrUrl: string | URL): string => {

    const path = validatePath(filePathOrUrl);
    if (path) return path;
    else return resolve(filePathOrUrl as string);
}

export const getResourceBuffer = async (filePathOrUrl: string | URL): Promise<Buffer> => {

    let imageBuffer: Buffer;
    // If URL
    if (filePathOrUrl instanceof URL || urlRegex.test(filePathOrUrl) || httpRegex.test(filePathOrUrl) ) {

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const origImage = await fetch(filePathOrUrl, { signal: controller.signal });

        clearTimeout(timeout);

        const imageBody = await origImage.arrayBuffer();

        imageBuffer = Buffer.from(imageBody);
    }
    // If local path
    else {
        const origImage = await readFileSync(filePathOrUrl);
        imageBuffer = origImage;
    }
    // Otherwise, local file

    return imageBuffer;
}

export const getJsonResource = async(objectOrPath: string | URL | any): Promise<any> => {

    if (typeof objectOrPath === 'object') {
        try {
            // Object literal
            JSON.parse(JSON.stringify(objectOrPath))
            return objectOrPath;
        }
        catch (e) {
            throw e;
        }
    }
    else {
        const path = objectOrPath as string | URL;
        if (path instanceof URL || urlRegex.test(path) || httpRegex.test(path)) {
            // URL of file
            const response = await fetch(path);
            const json = await response.json();
            return json;
        }
        else {
            // Local file
            const data = readFileSync(path, 'utf8');
            const json = JSON.parse(data);
            return json;
        }
    }
}

/**
 * Gets the file name without extension.
 * @param filePathOrUrl file path, URL string, or URL object
 * @returns 
 */
export const getFileName = (filePathOrUrl: string | URL): string => {
    let path: string;
    if (filePathOrUrl instanceof URL) {
        path = filePathOrUrl.pathname;
    }
    else {
        path = filePathOrUrl;
    }

    const fileName = parse(path).name;

    return fileName;
}

export const saveFile = (name: string, file: any, options: {outputDir: string, logLevel?: LogLevel}): string => {
    if (!options.outputDir) throw new Error('Output directory not specified.');

    let outputDirectory: string;
    if (isAbsolute(options.outputDir)) outputDirectory = options.outputDir;
    else outputDirectory = resolve(options.outputDir);
    
    const path = `${cleanTrailingSlash(outputDirectory)}/${name}`
    writeFileSync(path, file);

    log(`Saved file to ${path}.`, options);
    // returns the path
    return path;
}

export const cleanTrailingSlash = (path: string) => {
    return path.replace(/([^/])\/+$/, '$1');
}

export type LogLevel = 'none' | 'standard' | 'verbose';
let logLevel: LogLevel;

export const setupLogging = (level: LogLevel, jobName: string) => {
    logLevel = level;
    if (logLevel === 'verbose') {
        const logOutput = createWriteStream(`${jobName}-${Date.now()}.log`, {flags: 'a'});
        const logger = new Console(logOutput, logOutput);
        console.log = logger.log;
        console.error = logger.error;
    }
}

export const log = (message:string, options?: {logLevel?:LogLevel}) => {
    if ((options?.logLevel && options?.logLevel !== 'none') || (logLevel && logLevel !== 'none')) console.log(message);
}
export const error = (error:Error) => {
    if (logLevel !== 'none') console.error(error);
}