import { Layout } from "./layout/Layout.js";

import packageInfo from '../package.json' with {type:'json'};

const version = packageInfo.version;

export {
    Layout,
    version as VERSION
}