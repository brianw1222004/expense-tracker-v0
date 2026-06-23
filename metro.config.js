// Metro config — scoped resolver fix for @hugeicons/core-free-icons.
//
// The icon package ships per-icon ESM files (dist/esm/<Icon>.js) but its
// package "exports" map routes the `require` condition for every subpath to
// ./dist/cjs/<Icon>.js — and those per-icon CJS files DO NOT EXIST (only the
// barrel index is built for CJS). So importing icons individually (which lets
// Metro bundle ~40 files instead of the entire 6000-icon barrel) can't go
// through the exports map without risking a condition-dependent break.
//
// This resolver redirects '@hugeicons/core-free-icons/<Icon>' straight to the
// ESM data file, platform-agnostically. The files are pure SVG-path data, so
// web and native get identical output. Every other package resolves normally.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const ICON_PKG = '@hugeicons/core-free-icons/';
const ICON_ESM_DIR = path.resolve(
  __dirname,
  'node_modules/@hugeicons/core-free-icons/dist/esm'
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.startsWith(ICON_PKG) &&
    !moduleName.startsWith(`${ICON_PKG}dist/`) &&
    moduleName !== `${ICON_PKG}loader` &&
    moduleName !== `${ICON_PKG}package.json`
  ) {
    const icon = moduleName.slice(ICON_PKG.length);
    return { type: 'sourceFile', filePath: path.join(ICON_ESM_DIR, `${icon}.js`) };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
