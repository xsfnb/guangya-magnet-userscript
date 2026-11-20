// ==UserScript==
// @name         光鸭云盘 - 磁力链接云添加
// @namespace    https://github.com/xsfnb/guangya-magnet-userscript
// @version      1.7.1
// @description  页面磁力旁直接显示「离线下载」；添加时按剧名自动建目录归类，另支持整目录同剧归类。
// @author       xsfnb
// @homepageURL  https://github.com/xsfnb/guangya-magnet-userscript
// @supportURL   https://github.com/xsfnb/guangya-magnet-userscript/issues
// @match        *://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @connect      api.guangyapan.com
// @connect      account.guangyapan.com
// @license MIT
// 本地修改版：已移除 @downloadURL/@updateURL，避免被 Greasy Fork 上游版本覆盖
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================================
     * 配置区
     * =========================================================================
     * 说明：
     *  1. Token 自动获取：访问光鸭云盘页面时自动嗅探登录凭证并保存；也可通过油猴菜单“设置 Token”手动输入。
     *     Access Token 失效时会使用 Refresh Token 自动刷新并重试请求。
     *  2. 默认保存目录初始为空，首次打开目录选择器时会自动查找"来自：云添加"文件夹，
     *     找到后持久化保存。保存目录也可通过弹窗内"添加到"行的目录选择器（文件树）手动选择。
     *     油猴菜单"重置保存目录"可清除已保存的目录。
     *  3. resolve_res 接口的请求体为 { url: <磁力链接> }（与 create_task 风格一致，
     *     均为 POST + JSON）。如实际接口为 GET，修改 onCloudAdd() 内的请求即可。
     *  4. 目录列表来自 get_file_list（POST），根目录 parentId 传空字符串，
     *     下级目录用文件夹的 fileId 作为 parentId 懒加载。
     * ========================================================================= */
    var API_BASE = 'https://api.guangyapan.com';
    var ACCOUNT_BASE = 'https://account.guangyapan.com';
    var REFRESH_URL = ACCOUNT_BASE + '/v1/auth/token';
    var RESOLVE_URL = API_BASE + '/cloudcollection/v1/resolve_res';
    var CREATE_URL = API_BASE + '/cloudcollection/v1/create_task';
    var FILE_LIST_URL = API_BASE + '/userres/v1/file/get_file_list';
    var OAUTH_CLIENT_ID = 'aMe-8VSlkrbQXpUR';

    var GUANGYA_LOGO = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yOTQwXzgwODYpIj4NCjxwYXRoIGQ9Ik0wIDYuNjc5NjlDMCAyLjk5MDYgMi45OTA2IDAgNi42Nzk2OSAwSDIzLjMyMDNDMjcuMDA5NCAwIDMwIDIuOTkwNiAzMCA2LjY3OTY5VjIzLjMyMDNDMzAgMjcuMDA5NCAyNy4wMDk0IDMwIDIzLjMyMDMgMzBINi42Nzk2OUMyLjk5MDYgMzAgMCAyNy4wMDk0IDAgMjMuMzIwM1Y2LjY3OTY5WiIgZmlsbD0iI0ZGNjgwMCIvPg0KPHBhdGggZD0iTTAgNi42Nzk2OUMwIDIuOTkwNiAyLjk5MDYgMCA2LjY3OTY5IDBIMjMuMzIwM0MyNy4wMDk0IDAgMzAgMi45OTA2IDMwIDYuNjc5NjlWMjMuMzIwM0MzMCAyNy4wMDk0IDI3LjAwOTQgMzAgMjMuMzIwMyAzMEg2LjY3OTY5QzIuOTkwNiAzMCAwIDI3LjAwOTQgMCAyMy4zMjAzVjYuNjc5NjlaIiBmaWxsPSJ1cmwoI3BhaW50MF9yYWRpYWxfMjk0MF84MDg2KSIgZmlsbC1vcGFjaXR5PSIwLjciLz4NCjxwYXRoIGQ9Ik0xNi4xMDc3IDExLjY3NjdDMTYuOTU4OCAxMS42NzY3IDE3LjY0ODcgMTIuMzY0NiAxNy42NDg3IDEzLjIxMzJDMTcuNjQ4NyAxNC4wNjE4IDE2Ljk1ODggMTQuNzQ5NyAxNi4xMDc3IDE0Ljc0OTdDMTUuMjU2NyAxNC43NDk3IDE0LjU2NjcgMTQuMDYxOCAxNC41NjY3IDEzLjIxMzJDMTQuNTY2NyAxMi4zNjQ2IDE1LjI1NjcgMTEuNjc2NyAxNi4xMDc3IDExLjY3NjdaIiBmaWxsPSJ3aGl0ZSIvPg0KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNS43MDk4IDYuMjA5OTZDMTkuNDUwNiA2LjIwOTk2IDIyLjY0OCA4LjUyOTQyIDIzLjkzNDQgMTEuODA0NkMyMy45ODA3IDExLjkyMjMgMjQuMDkzNSAxMi4wMDE4IDI0LjIyMDMgMTIuMDAxOEgyNi44MzM2QzI2Ljk0OTIgMTIuMDAxOCAyNy4wNDI5IDEyLjA5NTIgMjcuMDQyOSAxMi4yMTA0QzI3LjA0MjkgMTIuNDI1IDI3LjAxOTcgMTIuNTI1OCAyNi45NzU3IDEyLjcyNzJDMjYuOTczMSAxMi43MzkgMjYuOTcwNSAxMi43NTA5IDI2Ljk2NzcgMTIuNzYyN0MyNi45NjUgMTIuNzc0NSAyNi45NjIyIDEyLjc4NjIgMjYuOTU5MyAxMi43OThDMjYuOTUzNiAxMi44MjE0IDI2Ljk0NzYgMTIuODQ0OCAyNi45NDEyIDEyLjg2ODFDMjYuOTM0OSAxMi44OTEzIDI2LjkyODQgMTIuOTE0NSAyNi45MjE1IDEyLjkzNzVDMjYuOTA0MyAxMi45OTUgMjYuODg1NCAxMy4wNTE4IDI2Ljg2NDggMTMuMTA3OEMyNi44NjA3IDEzLjExOSAyNi44NTY2IDEzLjEzMDIgMjYuODUyMyAxMy4xNDEzQzI2Ljc5NzEgMTMuMjg2MSAyNi43MzA3IDEzLjQyNTQgMjYuNjU0MSAxMy41NTgxQzI2LjY0ODMgMTMuNTY4MyAyNi42NDIzIDEzLjU3ODUgMjYuNjM2MyAxMy41ODg2QzI2LjYxODMgMTMuNjE5IDI2LjU5OTggMTMuNjQ5IDI2LjU4MDcgMTMuNjc4N0MyNi41NjE2IDEzLjcwODQgMjYuNTQyIDEzLjczNzcgMjYuNTIxOSAxMy43NjY2QzI2LjUwMDMgMTMuNzk3NiAyNi40NzgxIDEzLjgyODEgMjYuNDU1NCAxMy44NTgyQzI2LjQzMTkgMTMuODg5NSAyNi40MDc3IDEzLjkyMDIgMjYuMzgyOSAxMy45NTA1QzI2LjM3NDEgMTMuOTYxMiAyNi4zNjUzIDEzLjk3MTggMjYuMzU2NCAxMy45ODI0QzI2LjMyNDIgMTQuMDIwNyAyNi4yOTEgMTQuMDU4MiAyNi4yNTY5IDE0LjA5NDdDMjYuMjI0OSAxNC4xMjkgMjYuMTkyMSAxNC4xNjI1IDI2LjE1ODUgMTQuMTk1MUMyNi4xMjk0IDE0LjIyMzUgMjYuMDk5NiAxNC4yNTEzIDI2LjA2OTMgMTQuMjc4NEMyNi4wMzM3IDE0LjMxMDMgMjUuOTk3MyAxNC4zNDEzIDI1Ljk2MDIgMTQuMzcxNUMyNS45MTU5IDE0LjQwNzUgMjUuODcwNSAxNC40NDIyIDI1LjgyNCAxNC40NzU2QzI1LjY4NSAxNC41NzU2IDI1LjUzNjggMTQuNjYzOSAyNS4zODEgMTQuNzM4OEMyNS4zNzAzIDE0Ljc0MzkgMjUuMzU5NiAxNC43NDkgMjUuMzQ4OCAxNC43NTRDMjUuMjc2NCAxNC43ODc3IDI1LjIwMjQgMTQuODE4NSAyNS4xMjY5IDE0Ljg0NjNDMjUuMDY1MiAxNC44NjkxIDI1LjAwMjYgMTQuODg5OCAyNC45MzkxIDE0LjkwODVDMjQuODk1NSAxNC45MjEzIDI0Ljg1MTUgMTQuOTMzMiAyNC44MDcgMTQuOTQ0QzI0Ljc1OTkgMTQuOTU1NCAyNC43MTI0IDE0Ljk2NTggMjQuNjY0NCAxNC45NzQ5QzI0LjYyMzEgMTQuOTgyOCAyNC41ODEzIDE0Ljk4OTggMjQuNTM5NCAxNC45OTZDMjQuNDgxOCAxNS4wMDQ0IDI0LjE5NTggMTUuMDEzNyAyNC4xMDc4IDE1LjAxMzdIMjEuMTc4M0wyMS4xNzg0IDE1LjAxNDVIMjEuNjMxOUMyMS4yMjk2IDE1LjAzMyAyMS4xNzQ3IDE1LjM3NzYgMjEuMTU1NiAxNS41NTM0TDIxLjE1NTUgMTUuNTUyMkMyMC44NzY0IDIwLjE2MzUgMTcuMDM3MyAyMy44MTc0IDEyLjM0MjIgMjMuODE3NEM3LjU2Njk0IDIzLjgxNzQgMy42NzcwMSAyMC4wMzc3IDMuNTE3NjUgMTUuMzE1MUMzLjUxMjA1IDE1LjE0OSAzLjY0NzY0IDE1LjAxMzcgMy44MTQyNCAxNS4wMTM3SDYuNDA3MjRDNi42OTg5OCAxNC45OTE5IDYuODUzMzggMTQuODc0MiA2Ljg5NzYgMTQuNDMyNlYxNC40NTcyQzcuMTg1NTcgOS44NTQzIDExLjAyMDggNi4yMDk5OCAxNS43MDk4IDYuMjA5OTZaTTE1LjcwOTggOS41NzkzMkMxMi44MDA5IDkuNTc5MzQgMTAuNDI0MyAxMS44NTE0IDEwLjI2NzcgMTQuNzEyOEMxMC4yNTg2IDE0Ljg3ODcgMTAuMTI0NCAxNS4wMTM3IDkuOTU3ODYgMTUuMDEzN0g3LjIwOTIzQzYuOTY4NzYgMTUuMDMxMSA2LjkxMTY3IDE1LjIxNjEgNi45MDE5MSAxNS4zNDY2QzcuMDc0NDUgMTguMTkyOSA5LjQ0NDE5IDIwLjQ0OCAxMi4zNDIyIDIwLjQ0OEMxNS4yNTExIDIwLjQ0OCAxNy42Mjc3IDE4LjE3NTkgMTcuNzg0MyAxNS4zMTQ1QzE3Ljc5MzQgMTUuMTQ4NiAxNy45Mjc2IDE1LjAxMzcgMTguMDk0MiAxNS4wMTM3SDIwLjc2ODhDMjEuMDY2OCAxNC45NTg1IDIxLjE0MTIgMTQuNzAyNiAyMS4xMzk0IDE0LjUzNThDMjAuODk2NyAxMS43NTgzIDE4LjU1ODUgOS41NzkzMyAxNS43MDk4IDkuNTc5MzJaIiBmaWxsPSJ3aGl0ZSIvPg0KPC9nPg0KPGRlZnM+DQo8cmFkaWFsR3JhZGllbnQgaWQ9InBhaW50MF9yYWRpYWxfMjk0MF84MDg2IiBjeD0iMCIgY3k9IjAiIHI9IjEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiBncmFkaWVudFRyYW5zZm9ybT0idHJhbnNsYXRlKDI1LjE2NiAwLjU1NjY0KSByb3RhdGUoMTI3LjMxMikgc2NhbGUoMjIuNzY0MykiPg0KPHN0b3Agc3RvcC1jb2xvcj0iI0ZGQzMwRSIvPg0KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkZBNzBFIiBzdG9wLW9wYWNpdHk9IjAiLz4NCjwvcmFkaWFsR3JhZGllbnQ+DQo8Y2xpcFBhdGggaWQ9ImNsaXAwXzI5NDBfODA4NiI+DQo8cmVjdCB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIGZpbGw9IndoaXRlIi8+DQo8L2NsaXBQYXRoPg0KPC9kZWZzPg0KPC9zdmc+DQo='
    // 默认保存目录：初始为空，首次加载目录时会查找"来自：云添加"文件夹并持久化
    var DEFAULT_FOLDER = null;

    // 自动获取光鸭 Token：与 guangya_quickly 共享存储键，任一脚本在光鸭页面嗅探到 Authorization 都会持久化供复用
    var GUANGYA_AUTH_STORAGE_KEY = '__GUANGYA_CLOUD_QUICKLY_AUTH__';
    var GUANGYA_CREDENTIALS_PREFIX = 'credentials_' + OAUTH_CLIENT_ID;
    var OAUTH_CREDENTIAL_STORAGE_KEY = 'gyp_oauth_credentials';
    var REFRESH_TOKEN_STORAGE_KEY = 'gyp_refresh_token';
    var CAPTURE_EVENT = '__GYP_CLOUD_ADD_CAPTURE__';
    var REFRESH_LOCK_KEY = 'gyp_refresh_lock';
    var REFRESH_LOCK_TTL = 15000;
    var refreshPromise = null;
    var lastRememberedAuth = '';
    var BATCH_GAP_MS = 400;
    var batchRunning = false;

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function getToken() {
        // 1. 油猴菜单手动覆盖
        var manual = GM_getValue('gyp_token', '');
        if (manual && manual.trim()) return normalizeAuth(manual);
        // 2. 自动嗅探/存储（与 guangya_quickly 共享）
        var stored = getStoredAuth();
        if (stored) return stored;
        // 3. 无可用 Token
        return '';
    }
    function getManualToken() {
        try {
            var value = GM_getValue('gyp_token', '');
            return value && String(value).trim() ? normalizeAuth(value) : '';
        } catch (e) {
            return '';
        }
    }
    function updateManualTokenIfPresent(auth) {
        var manual = getManualToken();
        if (!manual || !auth) return;
        try { GM_setValue('gyp_token', normalizeAuth(auth)); } catch (e) {}
    }
    function getSelectedFolder() {
        var saved = GM_getValue('gyp_selected_folder', null);
        if (saved && saved.id != null && saved.name) return saved;
        // 如果没有保存的目录，返回根目录（id 为空字符串）
        return { id: '', name: '云盘根目录', path: [] };
    }
    function setSelectedFolder(f) {
        GM_setValue('gyp_selected_folder', { id: f.id, name: f.name, path: f.path || [] });
    }

    GM_registerMenuCommand('☁ 设置 Authorization Token', function () {
        var v = prompt('请输入 Authorization 的值（含 “Bearer “ 前缀）：', getToken());
        if (v != null) { GM_setValue('gyp_token', v.trim()); alert('Token 已保存'); }
    });
    GM_registerMenuCommand('🧽 清空手动设置的 Token', function () {
        GM_setValue('gyp_token', '');
        alert('已清空手动设置的 Token');
    });
    GM_registerMenuCommand('🔑 设置 Refresh Token', function () {
        var current = getRefreshToken();
        var v = prompt('请输入光鸭云盘的 Refresh Token：', current);
        if (v == null) return;
        v = v.trim().replace(/^Bearer\s+/i, '');
        if (!v) return;
        var credential = getStoredCredential() || {};
        credential.refresh_token = v;
        credential.updated_at = Date.now();
        setStoredCredential(credential);
        alert('Refresh Token 已保存');
    });
    GM_registerMenuCommand('🧹 清除自动 Token 和 Refresh Token', function () {
        try { GM_deleteValue(GUANGYA_AUTH_STORAGE_KEY); } catch (e) {}
        if (isGuangyaPageHost()) {
            try { window.localStorage.removeItem(GUANGYA_AUTH_STORAGE_KEY); } catch (e) {}
        }
        lastRememberedAuth = '';
        clearStoredCredential();
        alert('已清除自动获取的 Token 和 Refresh Token，下次访问光鸭云盘时会重新嗅探');
    });
    GM_registerMenuCommand('📚 批量添加本页全部磁力', batchAddPageMagnets);
    GM_registerMenuCommand('🗂 同剧归类（当前文件夹）', organizeCurrentFolder);
    GM_registerMenuCommand('🎯 切换：添加时自动按剧名建目录', function () {
        var next = !autoSeriesEnabled();
        GM_setValue('gyp_auto_series', next);
        alert('添加时自动按剧名建目录：' + (next ? '已开启' : '已关闭'));
    });
    GM_registerMenuCommand('🔘 切换：页面内「离线下载」按钮', toggleInline);
    GM_registerMenuCommand('🐞 切换：调试日志（F12 控制台）', function () {
        var next = !GM_getValue('gyp_debug', false);
        GM_setValue('gyp_debug', next);
        alert('调试日志：' + (next ? '已开启，操作时看 F12 控制台' : '已关闭'));
    });
    GM_registerMenuCommand('🔄 重置保存目录', function () {
        GM_deleteValue('gyp_selected_folder');
        alert('已重置保存目录，下次打开目录选择器时会自动查找"来自：云添加"文件夹');
    });

    /* =========================================================================
     * 工具函数
     * ========================================================================= */
    function formatSize(bytes) {
        if (bytes == null || isNaN(bytes)) return '-';
        bytes = Number(bytes);
        if (bytes < 1024) return bytes + ' B';
        var units = ['KB', 'MB', 'GB', 'TB', 'PB'];
        var i = -1;
        do { bytes /= 1024; i++; } while (bytes >= 1024 && i < units.length - 1);
        return bytes.toFixed(2) + ' ' + units[i];
    }
    function formatTime(ts) {
        if (!ts) return '-';
        var num = Number(ts);
        if (!isFinite(num)) return String(ts);
        var ms = num < 100000000000 ? num * 1000 : num; // 兼容秒 / 毫秒
        try { return new Date(ms).toLocaleString(); } catch (e) { return String(ts); }
    }
    function resTypeName(t) {
        var map = { 1: 'BT 种子', 2: 'HTTP/直链', 3: 'ed2k' };
        return map[t] || ('类型 ' + (t != null ? t : '?'));
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function sameId(a, b) {
        return String(a == null ? '' : a) === String(b == null ? '' : b);
    }

    var VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'avi', 'flv', 'm4v', 'ts', 'wmv', 'rmvb', 'rm',
        'mpeg', 'mpg', 'm2ts', 'webm'];
    var MIN_AUTO_SIZE = 10 * 1024 * 1024;

    // 默认自动勾选规则：视频扩展名且 >= 10MB
    function isSelectableVideo(file) {
        if (!file) return false;
        var name = String(file.fileName || '').toLowerCase();
        var dot = name.lastIndexOf('.');
        var ext = dot >= 0 ? name.slice(dot + 1) : '';
        var size = Number(file.fileSize);
        return VIDEO_EXTS.indexOf(ext) !== -1 && isFinite(size) && size >= MIN_AUTO_SIZE;
    }

    // 文件序号字段：光鸭不同接口用不同命名，按 V4 助手的优先级依次尝试
    var ENTRY_INDEX_KEYS = ['fileIndex', 'file_index', 'fileNo', 'file_no', 'index', 'idx', 'seq'];

    function pickEntryIndex(obj) {
        if (!obj || typeof obj !== 'object') return null;
        for (var i = 0; i < ENTRY_INDEX_KEYS.length; i++) {
            var raw = obj[ENTRY_INDEX_KEYS[i]];
            if (raw === null || raw === undefined || raw === '') continue;
            var num = Number(raw);
            if (isFinite(num) && num >= 0) return num;
        }
        return null;
    }

    // 从 resolve_res 的整个响应里收集文件条目，不只认 btResInfo.subfiles 这一条路径
    function collectResolvedFiles(data) {
        var out = [];
        var seenIndex = {};
        var seenNode = [];

        function visit(node, depth) {
            if (!node || typeof node !== 'object' || depth > 6) return;
            if (seenNode.indexOf(node) !== -1) return;
            seenNode.push(node);

            if (Array.isArray(node)) {
                node.forEach(function (item) { visit(item, depth + 1); });
                return;
            }

            var index = pickEntryIndex(node);
            if (index != null && !seenIndex[index]) {
                seenIndex[index] = 1;
                out.push(node);
            }

            for (var key in node) {
                if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
                var value = node[key];
                if (value && typeof value === 'object') visit(value, depth + 1);
            }
        }

        visit(data, 0);
        out.sort(function (a, b) { return pickEntryIndex(a) - pickEntryIndex(b); });
        return out;
    }

    // 把 subfiles 展平成 { file, depth, topIndex }，topIndex 是所属顶层项在 subfiles 里的位置
    function flattenSubfiles(subfiles) {
        var out = [];
        function walk(files, depth, inheritedTop) {
            (files || []).forEach(function (f, i) {
                if (!f) return;
                var top = depth === 0 ? i : inheritedTop;
                out.push({ file: f, depth: depth, topIndex: top });
                if (f.isDir === true && (f.subfiles || f.subFiles)) {
                    walk(f.subfiles || f.subFiles, depth + 1, top);
                }
            });
        }
        walk(subfiles, 0, -1);
        return out;
    }

    // 生成 create_task 的 fileIndexes：只用接口返回的真实序号。
    // 一个序号都识别不到时返回空数组，由调用方决定“整包添加（不传 fileIndexes）”。
    function buildFileIndexes(selected) {
        var values = [];
        var seen = {};
        var missing = 0;

        selected.forEach(function (item) {
            var index = pickEntryIndex(item.file);
            if (index == null) { missing++; return; }
            var key = String(index);
            if (seen[key]) return;
            seen[key] = 1;
            values.push(index);
        });

        values.sort(function (a, b) { return a - b; });
        var mode = 'exact';
        if (missing > 0) mode = values.length ? 'partial' : 'all';
        return { indexes: values, mode: mode, missing: missing };
    }

    // 统一的 GM 请求，返回 { status, json, text }
    // HTTP 401 时最多刷新一次，并使用新的 Access Token 重试原请求。
    function gmRequest(method, url, bodyObj) {
        var data = bodyObj ? JSON.stringify(bodyObj) : undefined;

        function send(auth) {
            var debug = GM_getValue('gyp_debug', false) === true;
            if (debug) {
                try { console.log('[光鸭] →', method, url, bodyObj || ''); } catch (e) {}
            }
            return new Promise(function (resolve, reject) {
                GM_xmlhttpRequest({
                    method: method,
                    url: url,
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': auth || ''
                    },
                    data: data,
                    onload: function (r) {
                        var json = null;
                        try { json = JSON.parse(r.responseText); } catch (e) {}
                        if (debug) {
                            try {
                                console.log('[光鸭] ←', r.status, String(r.responseText || '').slice(0, 1000));
                            } catch (e) {}
                        }
                        resolve({ status: r.status, json: json, text: r.responseText });
                    },
                    onerror: function () { reject(new Error('网络请求失败，请检查网络')); },
                    ontimeout: function () { reject(new Error('请求超时')); }
                });
            });
        }

        function executeWithToken(auth, canRefresh) {
            return send(auth).then(function (r) {
                if (r.status !== 401 || !canRefresh) return r;

                // 其它并发请求可能已经完成刷新，此时直接使用最新 Token 重试。
                var latestAuth = getToken();
                if (latestAuth && auth && latestAuth !== auth) {
                    return executeWithToken(latestAuth, false);
                }
                return refreshAccessToken().then(function (refreshedAuth) {
                    return executeWithToken(refreshedAuth, false);
                });
            });
        }

        var initialAuth = getToken();
        if (isAccessTokenExpired(initialAuth)) {
            return refreshAccessToken().then(function (refreshedAuth) {
                // 已在请求前刷新过，本次请求周期内不再二次刷新。
                return executeWithToken(refreshedAuth, false);
            });
        }
        return executeWithToken(initialAuth, true);
    }

    // 解析接口返回是否成功：优先看 code，其次看 msg，最后看 HTTP 状态
    function parseApiResult(r) {
        var ok = r.status >= 200 && r.status < 300;
        var msg = '';
        var data = r.json;
        if (data && typeof data === 'object') {
            var code = data.code;
            var hasCode = code !== undefined && code !== null;
            if (hasCode && code !== 0 && code !== '0') {
                ok = false;
                msg = data.msg || data.message || ('code=' + code);
            } else if (!hasCode && data.msg != null && !/^(success|ok)$/i.test(String(data.msg).trim())) {
                ok = false;
                msg = data.msg;
            }
        }
        if (!ok && !msg) msg = r.text ? String(r.text).slice(0, 200) : ('HTTP ' + r.status);
        if (r.status === 401) {
            msg = (msg ? msg + '；' : '') + 'Token 已失效，自动刷新失败或刷新后的 Token 仍无效，请重新登录光鸭云盘或手动更新 Token';
        }
        return { ok: ok, msg: msg, json: r.json };
    }

    /* =========================================================================
     * 自动获取光鸭 Token（注入页面 hook，嗅探光鸭请求的 Authorization 头）
     * ========================================================================= */
    // 统一为 "Bearer xxx" 形式
    function normalizeAuth(value) {
        var text = String(value == null ? '' : value).trim();
        if (!text) return '';
        return /^Bearer\s+/i.test(text) ? text : ('Bearer ' + text);
    }

    function isGuangyaPageHost() {
        return /(^|\.)guangyapan\.com$/i.test(window.location.hostname || '');
    }

    // 读取已存储的 Authorization：优先 GM（跨域持久），其次 localStorage
    function getStoredAuth() {
        try {
            if (typeof GM_getValue === 'function') {
                var v = GM_getValue(GUANGYA_AUTH_STORAGE_KEY, '');
                if (typeof v === 'string' && v.trim()) return normalizeAuth(v);
            }
        } catch (e) {}
        if (!isGuangyaPageHost()) return '';
        try {
            var local = window.localStorage.getItem(GUANGYA_AUTH_STORAGE_KEY) || '';
            return local.trim() ? normalizeAuth(local) : '';
        } catch (e) {
            return '';
        }
    }

    function setStoredAuth(value) {
        var auth = normalizeAuth(value);
        if (!auth) return;
        try {
            if (typeof GM_setValue === 'function') GM_setValue(GUANGYA_AUTH_STORAGE_KEY, auth);
        } catch (e) {}
        // 只在光鸭自己的域下写 localStorage，避免把 Token 泄漏到第三方站点
        if (!isGuangyaPageHost()) return;
        try {
            if (window.localStorage.getItem(GUANGYA_AUTH_STORAGE_KEY) !== auth) {
                window.localStorage.setItem(GUANGYA_AUTH_STORAGE_KEY, auth);
            }
        } catch (e) {}
    }

    function authTokenValue(value) {
        var auth = normalizeAuth(value);
        return auth.replace(/^Bearer\s+/i, '');
    }

    function getAuthSubject(auth) {
        try {
            var parts = authTokenValue(auth).split('.');
            if (parts.length < 2) return '';
            var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (payload.length % 4) payload += '=';
            var data = JSON.parse(atob(payload));
            return String(data.sub || data.subject || data.user_id || '');
        } catch (e) {
            return '';
        }
    }

    function parseJsonValue(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (e) { return value; }
    }

    function unwrapCredential(value) {
        for (var i = 0; i < 4; i++) {
            value = parseJsonValue(value);
            if (!value || typeof value !== 'object') return null;
            if (value.access_token || value.refresh_token) return value;
            if (value.data != null) value = value.data;
            else if (value.credentials != null) value = value.credentials;
            else return null;
        }
        return null;
    }

    function normalizeCredential(raw, fallbackSub) {
        var data = unwrapCredential(raw);
        if (!data) return null;
        var accessToken = String(data.access_token || data.accessToken || data.token || '').trim();
        var refreshToken = String(data.refresh_token || data.refreshToken || '').trim();
        if (!accessToken && !refreshToken) return null;
        var expiresIn = Number(data.expires_in || data.expiresIn || 0);
        var expiresAt = data.expires_at != null ? data.expires_at : data.expiresAt;
        if (expiresAt != null) {
            var numericExpiresAt = Number(expiresAt);
            if (isFinite(numericExpiresAt)) {
                expiresAt = numericExpiresAt < 1000000000000 ? numericExpiresAt * 1000 : numericExpiresAt;
            } else {
                var parsedExpiresAt = Date.parse(expiresAt);
                expiresAt = isNaN(parsedExpiresAt) ? 0 : parsedExpiresAt;
            }
        }
        if (!expiresAt && expiresIn > 0) expiresAt = Date.now() + expiresIn * 1000;
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: String(data.token_type || data.tokenType || 'Bearer').trim() || 'Bearer',
            expires_in: expiresIn > 0 ? expiresIn : 0,
            expires_at: expiresAt || 0,
            sub: String(data.sub || data.subject || data.user_id || fallbackSub || ''),
            updated_at: Date.now()
        };
    }

    function credentialMatchesAuth(credential, auth) {
        if (!credential || !credential.refresh_token || !auth) return false;
        var currentToken = authTokenValue(auth);
        var credentialToken = String(credential.access_token || '').trim();
        if (!credentialToken) return true;
        if (currentToken && currentToken === credentialToken) return true;
        var currentSubject = getAuthSubject(auth);
        var credentialSubject = String(credential.sub || '').trim();
        return !!(currentSubject && credentialSubject && currentSubject === credentialSubject);
    }

    function getStoredCredential() {
        try {
            var stored = normalizeCredential(GM_getValue(OAUTH_CREDENTIAL_STORAGE_KEY, null));
            if (stored && stored.refresh_token) return stored;
        } catch (e) {}
        try {
            var refreshToken = GM_getValue(REFRESH_TOKEN_STORAGE_KEY, '');
            if (refreshToken && String(refreshToken).trim()) {
                return normalizeCredential({ refresh_token: String(refreshToken).trim() });
            }
        } catch (e) {}
        return null;
    }

    function getRefreshToken() {
        var auth = getToken();
        var credential = getStoredCredential();
        if (credential && credential.refresh_token && (!auth || credentialMatchesAuth(credential, auth))) {
            return credential.refresh_token;
        }

        // 手动更换过 Access Token 时，优先从页面存储中找与当前账号匹配的 Refresh Token。
        credential = captureCredentialFromPage(auth);
        if (credential && credential.refresh_token && (!auth || credentialMatchesAuth(credential, auth))) {
            return credential.refresh_token;
        }

        // 没有 Access Token 时，已保存的 Refresh Token 仍可用于恢复登录。
        if (!auth && credential && credential.refresh_token) return credential.refresh_token;
        return '';
    }

    function isAccessTokenExpired(auth) {
        if (!auth) return false;
        var credential = getStoredCredential();
        if (!credential || !credential.refresh_token || !credential.expires_at) return false;
        // 只信任与当前 Access Token 完全对应的过期时间，避免账号匹配但 Token 已轮换时误判。
        return String(credential.access_token || '') === authTokenValue(auth) &&
            credential.expires_at <= Date.now();
    }

    function getRefreshErrorMessage(r) {
        var data = r && r.json;
        if (data && data.data && typeof data.data === 'object') data = data.data;
        if (data && typeof data === 'object') {
            var message = data.error_description || data.message || data.msg || data.error;
            if (message) return String(message);
            if (data.code != null) return 'code=' + data.code;
        }
        return r && r.text ? String(r.text).slice(0, 200) : ('HTTP ' + (r ? r.status : '?'));
    }

    function requestRefreshToken(refreshToken) {
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: REFRESH_URL,
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'X-Action': '401'
                },
                data: JSON.stringify({
                    client_id: OAUTH_CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                }),
                onload: function (r) {
                    var json = null;
                    try { json = JSON.parse(r.responseText); } catch (e) {}
                    resolve({ status: r.status, json: json, text: r.responseText });
                },
                onerror: function () { reject(new Error('刷新请求网络失败，请检查网络')); },
                ontimeout: function () { reject(new Error('刷新请求超时')); }
            });
        });
    }

    function doRefreshToken() {
        var refreshToken = getRefreshToken();
        if (!refreshToken) {
            return Promise.reject(new Error('Token 已失效，且未找到 Refresh Token，请重新登录光鸭云盘或手动设置 Token'));
        }

        var previous = getStoredCredential() || {};
        return requestRefreshToken(refreshToken).then(function (r) {
            var credential = normalizeCredential(r.json);
            if (r.status < 200 || r.status >= 300 || !credential || !credential.access_token) {
                throw new Error('Token 刷新失败：' + getRefreshErrorMessage(r));
            }

            // Go 客户端在刷新响应未返回新 Refresh Token 时保留原值。
            if (!credential.refresh_token) credential.refresh_token = refreshToken;
            if (!credential.sub && previous.sub) credential.sub = previous.sub;
            setStoredCredential(credential);
            return normalizeAuth(credential.access_token);
        });
    }

    // 所有并发 401 共享同一次刷新请求；跨标签页用 GM 存储里的时间戳做简易互斥。
    function refreshAccessToken() {
        if (refreshPromise) return refreshPromise;

        var startedAuth = getToken();
        var task = (function () {
            var lockTs = Number(GM_getValue(REFRESH_LOCK_KEY, 0)) || 0;
            if (Date.now() - lockTs < REFRESH_LOCK_TTL) {
                // 另一个标签页可能正在刷新：稍等后先看 Token 是否已被更新
                return sleep(1200).then(function () {
                    var latest = getToken();
                    if (latest && latest !== startedAuth) return latest;
                    try { GM_setValue(REFRESH_LOCK_KEY, Date.now()); } catch (e) {}
                    return doRefreshToken();
                });
            }
            try { GM_setValue(REFRESH_LOCK_KEY, Date.now()); } catch (e) {}
            return doRefreshToken();
        })();

        refreshPromise = task.then(function (auth) {
            refreshPromise = null;
            return auth;
        }, function (err) {
            refreshPromise = null;
            throw err;
        });
        return refreshPromise;
    }

    function clearStoredCredential() {
        try { GM_deleteValue(OAUTH_CREDENTIAL_STORAGE_KEY); } catch (e) {}
        try { GM_deleteValue(REFRESH_TOKEN_STORAGE_KEY); } catch (e) {}
        try { GM_deleteValue(REFRESH_LOCK_KEY); } catch (e) {}
    }

    function readLocalCredential(preferredAuth) {
        if (!isGuangyaPageHost()) return null;
        var preferredToken = authTokenValue(preferredAuth);
        var currentSub = '';
        var best = null;
        var bestScore = -1;
        var bestExpiresAt = -1;
        try { currentSub = String(window.localStorage.getItem('current_sub') || ''); } catch (e) {}
        try {
            for (var i = 0; i < window.localStorage.length; i++) {
                var key = window.localStorage.key(i) || '';
                if (key.indexOf(GUANGYA_CREDENTIALS_PREFIX) !== 0) continue;
                var suffix = key.slice(GUANGYA_CREDENTIALS_PREFIX.length);
                var fallbackSub = suffix.charAt(0) === '@' ? suffix.slice(1) : currentSub;
                var credential = normalizeCredential(window.localStorage.getItem(key), fallbackSub);
                if (!credential || !credential.refresh_token) continue;
                var score = 0;
                if (preferredToken && credential.access_token === preferredToken) score += 1000000;
                if (currentSub && credential.sub === currentSub) score += 10000;
                if (credential.expires_at) score += 1;
                if (score > bestScore || (score === bestScore && credential.expires_at > bestExpiresAt)) {
                    best = credential;
                    bestScore = score;
                    bestExpiresAt = credential.expires_at || 0;
                }
            }
        } catch (e) {}
        return best;
    }

    function writeCredentialToLocalStorage(credential) {
        if (!isGuangyaPageHost() || !credential) return;
        var selectedKey = '';
        var selectedScore = -1;
        var selectedExpiresAt = -1;
        try {
            for (var i = 0; i < window.localStorage.length; i++) {
                var key = window.localStorage.key(i) || '';
                if (key.indexOf(GUANGYA_CREDENTIALS_PREFIX) !== 0) continue;
                var suffix = key.slice(GUANGYA_CREDENTIALS_PREFIX.length);
                var fallbackSub = suffix.charAt(0) === '@' ? suffix.slice(1) : '';
                var current = normalizeCredential(window.localStorage.getItem(key), fallbackSub);
                if (!current) continue;
                var score = 0;
                if (credential.sub && current.sub === credential.sub) score += 10000;
                if (credential.access_token && current.access_token === credential.access_token) score += 1000000;
                if (score > selectedScore || (score === selectedScore && current.expires_at > selectedExpiresAt)) {
                    selectedKey = key;
                    selectedScore = score;
                    selectedExpiresAt = current.expires_at || 0;
                }
            }
            if (!selectedKey) return;
            var parsed = parseJsonValue(window.localStorage.getItem(selectedKey));
            var target = unwrapCredential(parsed);
            if (!target) return;
            if (credential.access_token) target.access_token = credential.access_token;
            if (credential.refresh_token) target.refresh_token = credential.refresh_token;
            if (credential.token_type) target.token_type = credential.token_type;
            if (credential.expires_in) target.expires_in = credential.expires_in;
            if (credential.expires_at) target.expires_at = credential.expires_at;
            if (credential.sub) target.sub = credential.sub;
            var nextValue = JSON.stringify(parsed && typeof parsed === 'object' ? parsed : target);
            if (window.localStorage.getItem(selectedKey) !== nextValue) {
                window.localStorage.setItem(selectedKey, nextValue);
            }
        } catch (e) {}
    }

    function setStoredCredential(raw) {
        var credential = normalizeCredential(raw);
        if (!credential) return null;
        var previous = null;
        try { previous = getStoredCredential(); } catch (e) {}
        var unchanged = previous && previous.access_token === credential.access_token &&
            previous.refresh_token === credential.refresh_token;
        if (!unchanged) {
            try { GM_setValue(OAUTH_CREDENTIAL_STORAGE_KEY, credential); } catch (e) {}
            if (credential.refresh_token) {
                try { GM_setValue(REFRESH_TOKEN_STORAGE_KEY, credential.refresh_token); } catch (e) {}
            }
        }
        if (credential.access_token) {
            var auth = normalizeAuth(credential.access_token);
            setStoredAuth(auth);
            updateManualTokenIfPresent(auth);
        }
        writeCredentialToLocalStorage(credential);
        return credential;
    }

    function captureCredentialFromPage(preferredAuth) {
        var credential = readLocalCredential(preferredAuth);
        if (!credential) return null;
        // 有当前 Token 时不要用其它账号的页面凭证覆盖。
        if (preferredAuth && !credentialMatchesAuth(credential, preferredAuth)) return null;
        return setStoredCredential(credential);
    }

    // 仅在光鸭页面落盘，避免在其它站点误存；同一 Token 不重复写入
    function rememberAuth(auth) {
        if (!isGuangyaPageHost() || !auth) return;
        if (auth === lastRememberedAuth) return;
        lastRememberedAuth = auth;
        setStoredAuth(auth);
        captureCredentialFromPage(auth);
    }

    // 注入到页面上下文的 hook 源码：patch fetch/XHR，捕获光鸭请求的 Authorization
    function networkHookPayload(EVENT_NAME) {
        if (window.__gypCloudAddHookInstalled) return;
        window.__gypCloudAddHookInstalled = true;
        function shouldCapture(url) {
            if (typeof url !== 'string' || !url) return false;
            try {
                var host = new URL(url, location.href).hostname.toLowerCase();
                return host === 'guangyapan.com' || host.endsWith('.guangyapan.com');
            } catch (e) {
                return String(url).indexOf('guangyapan.com') !== -1;
            }
        }
        function emit(auth) {
            // 只传字符串：原始类型才能安全穿过 Firefox 的沙盒/Xray 边界
            try { window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: String(auth || '') })); } catch (e) {}
        }
        function readAuth(hs) {
            if (!hs) return '';
            if (typeof Headers !== 'undefined' && hs instanceof Headers) return hs.get('authorization') || '';
            if (Array.isArray(hs)) {
                for (var i = 0; i < hs.length; i++) {
                    if (String(hs[i][0]).toLowerCase() === 'authorization') return hs[i][1];
                }
                return '';
            }
            if (typeof hs === 'object') {
                for (var k in hs) {
                    if (Object.prototype.hasOwnProperty.call(hs, k) && String(k).toLowerCase() === 'authorization') return hs[k];
                }
            }
            return '';
        }
        var origFetch = window.fetch;
        if (typeof origFetch === 'function') {
            window.fetch = function (input, init) {
                try {
                    var url = typeof input === 'string' ? input : (input && input.url) || '';
                    if (shouldCapture(url)) {
                        var auth = readAuth((init && init.headers) || (input && input.headers));
                        if (auth) emit(auth);
                    }
                } catch (e) {}
                return origFetch.apply(this, arguments);
            };
        }
        var origOpen = XMLHttpRequest.prototype.open;
        var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__gypCa = { url: url, headers: {} };
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this.__gypCa) this.__gypCa.headers[String(name).toLowerCase()] = value;
            return origSetHeader.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            try {
                if (this.__gypCa && shouldCapture(this.__gypCa.url) && this.__gypCa.headers.authorization) {
                    emit(this.__gypCa.headers.authorization);
                }
            } catch (e) {}
            return origSend.apply(this, arguments);
        };
    }

    // 把 hook 注入页面上下文（跨油猴沙盒），失败（如 CSP）则静默回退到已存储/内置 token
    function injectNetworkHook() {
        try {
            var code = '(' + networkHookPayload.toString() + ')(' + JSON.stringify(CAPTURE_EVENT) + ');';
            var s = document.createElement('script');
            s.textContent = code;
            (document.documentElement || document.head || document.body).appendChild(s);
            s.remove();
        } catch (e) { /* ignore */ }
    }

    // 从一个元素上提取磁力链接：href、data-clipboard-text 等 data-*、input/textarea 值、title/aria-label、纯文本
    var MAGNET_DATA_ATTRS = ['data-clipboard-text', 'data-clipboard', 'data-copy', 'data-magnet',
        'data-url', 'data-href', 'data-link', 'data-clipboard-url'];

    var MAGNET_SCAN_SELECTOR = 'a[href], [data-clipboard-text], [data-clipboard], [data-copy], ' +
        '[data-magnet], [data-url], [data-href], [data-link], input, textarea';

    function isMagnet(value) {
        return typeof value === 'string' && /^magnet:\?/i.test(value.trim());
    }

    var MAGNET_KNOWN_PARAMS = ['xt', 'dn', 'tr', 'xl', 'ws', 'as', 'xs', 'mt', 'kt', 'so',
        'x.pe', 'x.net', 'btih'];

    // 磁力被塞进跳转链接时，后面常跟着站点的其它查询参数，按已知参数名截断
    function trimMagnetParams(raw) {
        var parts = String(raw).split('&');
        var out = [parts[0]];
        for (var i = 1; i < parts.length; i++) {
            var key = parts[i].split('=')[0].trim().toLowerCase();
            if (MAGNET_KNOWN_PARAMS.indexOf(key) === -1) break;
            out.push(parts[i]);
        }
        return out.join('&');
    }

    function magnetOfElement(el) {
        if (!el || el.nodeType !== 1) return null;
        var tag = el.tagName;
        var i;
        var v;

        // 1) 普通链接（含把磁力塞在跳转参数里的写法）
        if (tag === 'A' || tag === 'AREA') {
            v = el.getAttribute('href');
            if (isMagnet(v)) return v.trim();
            if (v && String(v).indexOf('magnet:') !== -1) {
                var inner = String(v).match(/(magnet:\?[^\s"'<>]+)/i);
                if (inner) return trimMagnetParams(inner[1]);
            }
        }

        // 2) 复制按钮类站点：JAVDB / Mikan / 各类种子站
        for (i = 0; i < MAGNET_DATA_ATTRS.length; i++) {
            v = el.getAttribute(MAGNET_DATA_ATTRS[i]);
            if (isMagnet(v)) return v.trim();
        }

        // 3) 输入框 / 文本域里展示的磁力
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            v = String(el.value == null ? '' : el.value);
            if (isMagnet(v)) return v.trim();
        }

        // 4) title / aria-label
        v = el.getAttribute('title') || el.getAttribute('aria-label');
        if (isMagnet(v)) return v.trim();

        // 5) 纯文本（只在叶子节点上判断，避免对大容器反复做 textContent）
        if (!el.childElementCount) {
            var text = String(el.textContent || '').trim();
            if (isMagnet(text)) return text.split(/\s+/)[0];
        }
        return null;
    }

    // 从事件目标向上找最近一个带磁力的元素（兼容图标包在链接里、文字包在 span 里）
    function findMagnetEl(start) {
        var node = start;
        for (var depth = 0; node && node.nodeType === 1 && depth < 6; depth++) {
            var magnet = magnetOfElement(node);
            if (magnet) return { magnet: magnet, el: node };
            node = node.parentElement;
        }
        return null;
    }

    /* =========================================================================
     * 样式注入
     * ========================================================================= */
    var STYLE_ID = 'gyp-cloud-add-style';
    if (!document.getElementById(STYLE_ID)) {
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.gyp-inline-add{display:inline-block !important;margin:0 0 0 6px !important;padding:2px 8px !important;',
            'font-size:12px !important;line-height:1.5 !important;color:#ff6800 !important;background:#fff !important;',
            'border:1px solid #ff6800 !important;border-radius:10px !important;cursor:pointer !important;',
            'vertical-align:middle !important;white-space:nowrap !important;user-select:none !important;',
            'text-decoration:none !important;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif !important;}',
            '.gyp-inline-add:hover{background:#fff3e6 !important;}',
            '#gyp-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);',
            'display:flex;align-items:center;justify-content:center;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;}',
            '.gyp-modal{width:540px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;',
            'background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;color:#1f2937;}',
            '.gyp-modal .gyp-header{display:flex;align-items:center;justify-content:space-between;',
            'padding:14px 18px;background:linear-gradient(135deg,#ff8a33,#ff6800);color:#fff;font-size:15px;font-weight:600;}',
            '.gyp-modal .gyp-header-icon{width:18px;height:18px;vertical-align:middle;margin-right:6px;}',
            '.gyp-modal .gyp-close{background:none;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1;padding:0 4px;}',
            '.gyp-modal .gyp-body{padding:16px 18px;overflow-y:auto;font-size:13px;}',
            '.gyp-modal .gyp-row{display:block;margin-bottom:12px;width:100%;box-sizing:border-box;clear:both;}',
            '.gyp-modal .gyp-label{display:inline-block;vertical-align:top;width:80px;color:#6b7280;}',
            '.gyp-modal .gyp-value{display:inline-block;vertical-align:top;width:calc(100% - 85px);word-break:break-all;box-sizing:border-box;}',
            '.gyp-modal input.gyp-input{width:100%;padding:6px 9px;border:1px solid #d1d5db;border-radius:6px;',
            'font-size:13px;box-sizing:border-box;font-family:inherit;}',
            '.gyp-modal input.gyp-input:focus{outline:none;border-color:#ff6800;box-shadow:0 0 0 2px rgba(255,104,0,.15);}',
            '.gyp-modal .gyp-subhead{margin:14px 0 8px;padding-top:12px;border-top:1px solid #f0f0f0;',
            'display:flex;align-items:center;justify-content:space-between;font-weight:600;}',
            '.gyp-modal .gyp-toggle{color:#ff6800;cursor:pointer;font-weight:400;font-size:12px;}',
            '.gyp-modal .gyp-multi-info{display:flex;gap:16px;flex-wrap:wrap;}',
            '.gyp-modal .gyp-info-item{display:flex;flex-direction:row;gap:2px;}',
            '.gyp-modal .gyp-info-label{font-size:12px;color:#6b7280;}',
            '.gyp-modal .gyp-info-value{font-size:13px;color:#1f2937;}',
            '.gyp-modal .gyp-sublist{list-style:none;margin:0;padding:0;max-height:400px;overflow-y:auto;',
            'border:1px solid #eee;border-radius:8px;}',
            '.gyp-modal .gyp-subitem{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f5f5f5;}',
            '.gyp-modal .gyp-subitem:last-child{border-bottom:none;}',
            '.gyp-modal .gyp-subitem:hover{background:#f9fafb;}',
            '.gyp-modal .gyp-subtoggle{width:16px;text-align:center;color:#b1b1b1;cursor:pointer;flex-shrink:0;user-select:none;font-size:12px;}',
            '.gyp-modal .gyp-subtoggle:hover{color:#ff6800;}',
            /* 自定义复选框 */
            '.gyp-modal .gyp-check{position:absolute;opacity:0;width:0;height:0;}',
            '.gyp-modal .gyp-custom-checkbox{width:16px;height:16px;border:2px solid #d1d5db;border-radius:4px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;box-sizing:border-box;}',
            '.gyp-modal .gyp-custom-checkbox:hover{border-color:#ff6800;}',
            '.gyp-modal .gyp-check:checked + .gyp-custom-checkbox{background:#ff6800;border-color:#ff6800;}',
            '.gyp-modal .gyp-check:checked + .gyp-custom-checkbox::after{content:"";width:8px;height:4px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg);margin-top:-1px;}',
            '.gyp-modal .gyp-check:indeterminate + .gyp-custom-checkbox{background:#fff;border-color:#ff6800;}',
            '.gyp-modal .gyp-check:indeterminate + .gyp-custom-checkbox::after{content:"";width:8px;height:2px;background:#ff6800;}',
            '.gyp-modal .gyp-subicon{font-size:14px;flex-shrink:0;}',
            '.gyp-modal .gyp-subname{flex:1;word-break:break-all;min-width:0;}',
            '.gyp-modal .gyp-subsize{color:#9ca3af;font-size:12px;flex-shrink:0;}',
            '.gyp-modal .gyp-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;',
            'padding:12px 18px;border-top:1px solid #eee;background:#fafafa;}',
            '.gyp-modal .gyp-status{flex:1;font-size:12px;color:#6b7280;word-break:break-all;}',
            '.gyp-modal .gyp-status.err{color:#dc2626;}',
            '.gyp-modal .gyp-status.ok{color:#16a34a;}',
            '.gyp-modal button.gyp-btn{padding:7px 16px;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:500;font-family:inherit;}',
            '.gyp-modal .gyp-btn-primary{background:#ff6800;color:#fff;}',
            '.gyp-modal .gyp-btn-primary:hover{background:#e65c00;}',
            '.gyp-modal .gyp-btn-primary:disabled{background:#ffc299;cursor:not-allowed;}',
            '.gyp-modal .gyp-btn-ghost{background:#e5e7eb;color:#374151;}',
            '.gyp-modal .gyp-btn-ghost:hover{background:#d1d5db;}',
            '.gyp-modal .gyp-loading{text-align:center;padding:50px 0;color:#6b7280;}',
            '.gyp-modal .gyp-spinner{display:inline-block;width:28px;height:28px;border:3px solid #e5e7eb;',
            'border-top-color:#ff6800;border-radius:50%;animation:gypspin .8s linear infinite;margin-bottom:12px;}',
            '.gyp-modal .gyp-error{padding:30px 10px;color:#dc2626;text-align:center;line-height:1.7;word-break:break-all;}',
            '@keyframes gypspin{to{transform:rotate(360deg);}}',
            /* “添加到"目录选择行 */
            '.gyp-modal .gyp-folder-pick{display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;background:#f9fafb;font-size:13px;width:100%;box-sizing:border-box;}',
            '.gyp-modal .gyp-folder-pick:hover{border-color:#ff6800;background:#fff3e6;}',
            '.gyp-modal .gyp-fp-icon{font-size:15px;flex-shrink:0;}',
            '.gyp-modal .gyp-fp-name{font-weight:600;color:#1f2937;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;}',
            '.gyp-modal .gyp-fp-path{flex:1;color:#9ca3af;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
            '.gyp-modal .gyp-fp-arrow{color:#ff6800;font-size:12px;flex-shrink:0;}',
            /* 目录选择器弹窗（叠加在结果弹窗之上） */
            '#gyp-folder-picker{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;}',
            '#gyp-folder-picker .gyp-modal.gyp-folder-modal{width:480px;height:560px;}',
            '#gyp-folder-picker .gyp-folder-path{padding:8px 18px;background:#fff3e6;font-size:12px;color:#6b7280;border-bottom:1px solid #eee;word-break:break-all;}',
            '#gyp-folder-picker .gyp-tree{flex:1;overflow-y:auto;padding:6px 8px;}',
            '#gyp-folder-picker .gyp-fnode{list-style:none;}',
            '#gyp-folder-picker .gyp-frow{display:flex;align-items:center;gap:6px;padding:6px 6px;border-radius:6px;cursor:pointer;font-size:13px;}',
            '#gyp-folder-picker .gyp-frow:hover{background:#fff3e6;}',
            '#gyp-folder-picker .gyp-fnode.sel > .gyp-frow{background:#ffe6cc;}',
            '#gyp-folder-picker .gyp-fnode.sel > .gyp-frow .gyp-fname{color:#e65c00;font-weight:600;}',
            '#gyp-folder-picker .gyp-toggle{width:14px;text-align:center;color:#b1b1b1;cursor:pointer;flex-shrink:0;user-select:none;}',
            '#gyp-folder-picker .gyp-toggle:hover{color:#ff6800;}',
            '#gyp-folder-picker .gyp-radio{width:14px;height:14px;border:2px solid #d1d5db;border-radius:50%;flex-shrink:0;box-sizing:border-box;}',
            '#gyp-folder-picker .gyp-fnode.sel > .gyp-frow .gyp-radio{border-color:#ff6800;background:#ff6800;box-shadow:inset 0 0 0 2px #fff;}',
            '#gyp-folder-picker .gyp-ficon{font-size:14px;flex-shrink:0;}',
            '#gyp-folder-picker .gyp-fname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
            '#gyp-folder-picker .gyp-fcount{color:#9ca3af;font-size:11px;flex-shrink:0;}',
            '#gyp-folder-picker .gyp-children{margin:0;padding:0;}',
            '#gyp-folder-picker .gyp-loading-row{list-style:none;padding:6px 10px;color:#9ca3af;font-size:12px;}'
        ].join('');
        (document.head || document.documentElement).appendChild(style);
    }

    /* =========================================================================
     * 自动获取光鸭 Token：监听页面 hook 抛出的 Authorization 并落盘
     * ========================================================================= */
    window.addEventListener(CAPTURE_EVENT, function (event) {
        var detail = event && event.detail;
        var auth = typeof detail === 'string' ? detail : (detail && detail.authorization ? detail.authorization : '');
        if (auth) rememberAuth(auth);
    });
    // 仅在光鸭页面注入 hook 嗅探；其它站点只读取已存储的 token
    if (isGuangyaPageHost()) {
        injectNetworkHook();
    }

    /* v1.4.0：移除了悬浮按钮，改为在页面磁力旁直接显示「离线下载」按钮 */

    /* =========================================================================
     * 页面内「离线下载」按钮：自动扫描本页磁力并直接显示，不再有悬浮层
     * ========================================================================= */
    var INLINE_SELECTOR = 'a[href^="magnet:"], area[href^="magnet:"], ' +
        '[data-clipboard-text^="magnet:"], [data-clipboard^="magnet:"], [data-copy^="magnet:"], ' +
        '[data-magnet^="magnet:"], [data-url^="magnet:"]';

    function inlineEnabled() {
        return GM_getValue('gyp_inline', true) !== false;
    }

    function removeInlineButtons() {
        Array.prototype.forEach.call(document.querySelectorAll('.gyp-inline-add'), function (n) {
            n.remove();
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-gyp-inline]'), function (n) {
            n.removeAttribute('data-gyp-inline');
        });
    }

    function injectInlineButtons() {
        if (!inlineEnabled()) return;
        var nodes = document.querySelectorAll(INLINE_SELECTOR);
        Array.prototype.forEach.call(nodes, function (el) {
            if (!el || el.nodeType !== 1) return;
            if (el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
            if (el.hasAttribute && el.hasAttribute('data-gyp-inline')) return;
            if (el.closest && el.closest('#gyp-overlay,#gyp-batch-overlay,#gyp-folder-picker')) return;
            var magnet = magnetOfElement(el);
            if (!magnet) return;
            if (el.setAttribute) el.setAttribute('data-gyp-inline', '1');
            var chip = document.createElement('span');
            chip.className = 'gyp-inline-add';
            chip.textContent = '☁ 离线下载';
            chip.title = '添加到光鸭云盘的离线下载';
            chip.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                onCloudAdd(magnet);
            }, true);
            if (el.parentNode) el.parentNode.insertBefore(chip, el.nextSibling);
        });
    }

    function startInlineScanner() {
        injectInlineButtons();
        var pending = null;
        function schedule() {
            if (pending) return;
            pending = setTimeout(function () {
                pending = null;
                injectInlineButtons();
            }, 400);
        }
        try {
            var observer = new MutationObserver(schedule);
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-clipboard-text', 'data-clipboard', 'data-copy', 'data-magnet',
                    'data-url', 'href', 'title', 'aria-label', 'value']
            });
        } catch (e) { /* 忽略 */ }
        // 兜底：JS 直接改属性、但不触发 mutation 的极端情况
        setInterval(function () {
            if (document.hidden) return;
            injectInlineButtons();
        }, 2500);
    }

    function toggleInline() {
        var next = !inlineEnabled();
        GM_setValue('gyp_inline', next);
        if (next) injectInlineButtons();
        else removeInlineButtons();
        alert('页面内「离线下载」按钮：' + (next ? '已开启' : '已关闭'));
    }

    startInlineScanner();

    /* =========================================================================
     * 本页磁力批量添加（一集一条磁力时，一次全部丢进同一个目录）
     * ========================================================================= */
    function magnetKey(magnet) {
        var m = String(magnet || '').match(/urn:btih:([A-Za-z0-9]+)/i);
        return m ? 'btih:' + m[1].toLowerCase() : String(magnet || '');
    }

    function magnetDisplayName(magnet) {
        var m = String(magnet || '').match(/[?&]dn=([^&]+)/i);
        if (!m) return '';
        try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
    }

    function collectPageMagnets() {
        var seen = {};
        var list = [];
        var nodes = document.querySelectorAll(MAGNET_SCAN_SELECTOR);
        Array.prototype.forEach.call(nodes, function (el) {
            var magnet = magnetOfElement(el);
            if (!magnet) return;
            var key = magnetKey(magnet);
            if (seen[key]) return;
            seen[key] = 1;
            list.push(magnet);
        });
        return list;
    }

    // 批量模式的自动选文件规则：优先视频文件；一个视频都没有时退回全部文件
    function pickAutoIndexes(subfiles) {
        var entries = flattenSubfiles(subfiles);
        var files = entries.filter(function (e) { return e.file && e.file.isDir !== true; });
        var videos = files.filter(function (e) { return isSelectableVideo(e.file); });
        var chosen = videos.length ? videos : files;
        if (!chosen.length) return { indexes: [], mode: 'all', isVideo: false };
        var built = buildFileIndexes(chosen);
        return { indexes: built.indexes, mode: built.mode, isVideo: videos.length > 0 };
    }

    function buildBatchOverlay(total, title) {
        var overlay = document.createElement('div');
        overlay.id = 'gyp-batch-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;';
        var box = document.createElement('div');
        box.style.cssText = 'width:580px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;' +
            'background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;color:#1f2937;';
        box.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;' +
            'background:linear-gradient(135deg,#ff8a33,#ff6800);color:#fff;font-size:15px;font-weight:600;">' +
            '<span class="gyp-b-title">' + escapeHtml(title || '📚 批量云添加') + '</span>' +
            '<button class="gyp-b-stop" style="background:none;border:none;color:#fff;font-size:13px;cursor:pointer;">停止</button>' +
            '</div>' +
            '<div class="gyp-b-target" style="padding:10px 18px 0;font-size:12px;color:#6b7280;"></div>' +
            '<pre class="gyp-b-log" style="margin:10px 18px;padding:10px;height:300px;overflow:auto;background:#f9fafb;' +
            'border:1px solid #eee;border-radius:8px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;"></pre>' +
            '<div style="display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #eee;background:#fafafa;">' +
            '<span class="gyp-b-status" style="flex:1;font-size:12px;color:#6b7280;">准备中…</span>' +
            '<button class="gyp-b-copy" style="display:none;padding:7px 14px;border:none;border-radius:6px;' +
            'background:#e5e7eb;color:#374151;font-size:13px;cursor:pointer;">复制失败清单</button>' +
            '<button class="gyp-b-done" style="display:none;padding:7px 16px;border:none;border-radius:6px;' +
            'background:#ff6800;color:#fff;font-size:13px;cursor:pointer;">完成</button>' +
            '</div>';
        overlay.appendChild(box);
        (document.body || document.documentElement).appendChild(overlay);
        return overlay;
    }

    function batchAddPageMagnets() {
        if (batchRunning) { alert('批量添加正在进行中，请稍候'); return; }
        var magnets = collectPageMagnets();
        if (!magnets.length) { alert('本页没有找到磁力链接'); return; }
        if (!getToken()) {
            alert('未获取到光鸭 Token。请先登录 guangyapan.com（脚本会自动嗅探），或在油猴菜单里手动设置。');
            return;
        }
        var folder = getSelectedFolder();
        if (!confirm('即将把本页 ' + magnets.length + ' 条磁力添加到「' + folder.name + '」\n' +
            '默认规则：优先选视频文件（≥10MB），一个视频都没有时添加全部文件。\n\n继续？')) return;
        batchRunning = true;
        runBatch(magnets, '').then(function () {
            batchRunning = false;
        }, function () {
            batchRunning = false;
        });
    }

    function runBatch(magnets, prefix) {
        var folder = getSelectedFolder();
        var overlay = buildBatchOverlay(magnets.length);
        var titleEl = overlay.querySelector('.gyp-b-title');
        var logEl = overlay.querySelector('.gyp-b-log');
        var statusEl = overlay.querySelector('.gyp-b-status');
        var stopBtn = overlay.querySelector('.gyp-b-stop');
        var copyBtn = overlay.querySelector('.gyp-b-copy');
        var doneBtn = overlay.querySelector('.gyp-b-done');
        var targetEl = overlay.querySelector('.gyp-b-target');
        targetEl.textContent = '保存到：' +
            (folder.path && folder.path.length ? folder.path.join(' / ') : folder.name);

        var stopped = false;
        var okCount = 0;
        var failList = [];

        function logLine(text, color) {
            var line = document.createElement('div');
            if (color) line.style.color = color;
            line.textContent = text;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
        }

        stopBtn.addEventListener('click', function () {
            stopped = true;
            stopBtn.disabled = true;
            stopBtn.textContent = '停止中…';
            statusEl.textContent = '正在停止（处理完当前这条后结束）…';
        });
        doneBtn.addEventListener('click', function () { overlay.remove(); });
        copyBtn.addEventListener('click', function () {
            try {
                GM_setClipboard(failList.join('\n'));
                copyBtn.textContent = '已复制';
            } catch (e) {}
        });

        return (async function () {
            for (var i = 0; i < magnets.length; i++) {
                if (stopped) break;
                var magnet = magnets[i];
                var fallbackName = magnetDisplayName(magnet) || ('磁力 ' + (i + 1));
                titleEl.textContent = '📚 批量云添加（' + (i + 1) + '/' + magnets.length + '）';
                statusEl.textContent = '正在解析：' + fallbackName;
                try {
                    var resolveRes = await gmRequest('POST', RESOLVE_URL, { url: magnet });
                    var resolved = parseApiResult(resolveRes);
                    if (!resolved.ok || !resolved.json || !resolved.json.data) {
                        throw new Error('解析失败：' + (resolved.msg || '接口返回为空'));
                    }
                    var data = resolved.json.data;
                    var bt = data.btResInfo || {};
                    var files = collectResolvedFiles(data);
                    if (!files.length && bt.fileName && bt.fileSize != null) {
                        files = [{ fileName: bt.fileName, fileSize: bt.fileSize }];
                    }
                    var picked = pickAutoIndexes(files);

                    var taskName = (prefix || '') + (bt.fileName || fallbackName);
                    statusEl.textContent = '正在创建任务：' + taskName;

                    // 同剧归类：每条磁力先建/复用同名剧集文件夹
                    var taskParentId = String(folder.id == null ? '' : folder.id);
                    if (autoSeriesEnabled()) {
                        var series = detectSeriesName(bt.fileName || (files[0] && files[0].fileName) || '');
                        var seriesDirName = series ? sanitizeDirName(series) : '';
                        if (seriesDirName) {
                            try {
                                taskParentId = await ensureFolder(taskParentId, seriesDirName);
                            } catch (e) { /* 建目录失败就放回原目录 */ }
                        }
                    }

                    var createBody = {
                        url: data.url || magnet,
                        parentId: taskParentId
                    };
                    if (picked.indexes.length) createBody.fileIndexes = picked.indexes;
                    var createRes = await gmRequest('POST', CREATE_URL, createBody);
                    var created = parseApiResult(createRes);
                    if (!created.ok) throw new Error('创建任务失败：' + (created.msg || ''));

                    okCount++;
                    var desc = picked.indexes.length
                        ? ('已选 ' + picked.indexes.length + ' 个文件' +
                            (picked.isVideo ? '（含视频）' : '（无视频，全部文件）'))
                        : '未识别到文件序号，整包添加';
                    logLine('✓ ' + taskName + '（' + desc + '）', '#16a34a');
                } catch (e) {
                    failList.push(fallbackName + '\t' + magnet + '\t' + (e && e.message ? e.message : e));
                    logLine('✗ ' + fallbackName + '：' + (e && e.message ? e.message : e), '#dc2626');
                }
                if (!stopped && i < magnets.length - 1) await sleep(BATCH_GAP_MS);
            }

            titleEl.textContent = '📚 批量云添加（已结束）';
            statusEl.textContent = '成功 ' + okCount + ' 条，失败 ' + failList.length + ' 条' +
                (stopped ? '（已手动停止）' : '');
            stopBtn.style.display = 'none';
            doneBtn.style.display = '';
            if (failList.length) copyBtn.style.display = '';
        })();
    }

    /* =========================================================================
     * 同剧归类：把当前文件夹里同一部剧的多个文件归到一个同名子文件夹
     * ========================================================================= */
    var RES_API_PREFIXES = ['/userres/v1', '/nd.bizuserres.s/v1'];
    var organizing = false;

    // 资源类接口：先用现在能用的短路径，失败时自动退到 /nd. 前缀
    function resApi(suffix, body) {
        var index = 0;
        function attempt() {
            var url = API_BASE + RES_API_PREFIXES[index] + suffix;
            return gmRequest('POST', url, body).then(function (r) {
                var hasNext = index + 1 < RES_API_PREFIXES.length;
                var code = r.json && r.json.code != null ? r.json.code : null;
                var failed = r.status < 200 || r.status >= 300 || (code !== null && code !== 0 && code !== '0');
                if (hasNext && failed) {
                    index++;
                    return attempt();
                }
                return r;
            });
        }
        return attempt();
    }

    function autoSeriesEnabled() {
        return GM_getValue('gyp_auto_series', true) !== false;
    }

    // 不带 resType，一次拿全（文件和文件夹），客户端再按 resType 区分，避免 resType 过滤被服务端忽略/不支持
    function fetchFolderEntries(parentId) {
        var pid = parentId == null ? '' : String(parentId);
        var PAGE_SIZE = 100;
        var collected = [];
        function loadPage(page) {
            return resApi('/file/get_file_list', {
                page: page,
                pageSize: PAGE_SIZE,
                parentId: pid,
                orderBy: 0,
                sortType: 0
            }).then(function (r) {
                var ret = parseApiResult(r);
                if (!ret.ok || !ret.json || !ret.json.data) {
                    throw new Error(ret.msg || ('HTTP ' + r.status));
                }
                var list = ret.json.data.list || [];
                collected = collected.concat(list);
                if (list.length >= PAGE_SIZE && page < 9) return loadPage(page + 1);
                return collected;
            });
        }
        return loadPage(0);
    }

    function currentFolderIdFromUrl() {
        var hash = String(location.hash || '');
        var m = hash.match(/\/all\/(\d+)/) || hash.match(/\/folder\/(\d+)/) || hash.match(/\/(\d{6,})(?:-|$)/);
        return m ? m[1] : '';
    }

    // 按 Windows 规则清洗目录名
    function sanitizeDirName(name) {
        var text = String(name == null ? '' : name)
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/, '')
            .trim();
        if (text.length > 100) text = text.slice(0, 100).trim();
        return text;
    }

    // 集数标记：S01E02 / EP07 / 第07话 / 独立的 07
    var SERIES_EPISODE_MARKER = /(?:^|[\s._\-\[\]()（）【】])(?:S\d{1,2}\s*E\d{1,3}|EP?\s*\d{1,4}|第\s*\d{1,4}\s*[话話集回]|\d{1,3}(?:v\d)?(?=$|[\s._\-\[\]()（）【】]))/i;

    // 从文件名猜剧名：先去 [组名]/[1080P] 这类方括号标签，再截断到第一处集数标记
    function detectSeriesName(fileName) {
        var raw = String(fileName || '');
        var name = raw.replace(/\.[A-Za-z0-9]{1,8}$/, '');
        name = name.replace(/[\[【][^\]】]*[\]】]/g, ' ');
        name = name.replace(/[._]+/g, ' ');
        name = name.replace(/\s+/g, ' ').trim();
        var m = name.match(SERIES_EPISODE_MARKER);
        if (m && m.index > 0) name = name.slice(0, m.index);
        name = name.replace(/[\s\-–—_.]+$/g, '').trim();
        if (!name) name = raw.replace(/\.[A-Za-z0-9]{1,8}$/, '').trim();
        return name;
    }

    function collectSeriesGroups(entries) {
        var groups = {};
        var order = [];
        (entries || []).forEach(function (f) {
            if (Number(f.resType) === 2) return; // 跳过文件夹
            var series = detectSeriesName(f.fileName);
            var dirName = sanitizeDirName(series);
            if (!dirName) return;
            if (!groups[dirName]) {
                groups[dirName] = [];
                order.push(dirName);
            }
            groups[dirName].push(f);
        });
        return order.map(function (name) {
            return { name: name, files: groups[name] };
        }).filter(function (g) { return g.files.length >= 2; });
    }

    var seriesFolderCache = {};

    async function ensureFolder(parentId, name) {
        var cacheKey = String(parentId || '');
        var map = seriesFolderCache[cacheKey];
        if (map && map[name]) return map[name];

        var folders = await fetchFolderEntries(parentId);
        map = seriesFolderCache[cacheKey] = seriesFolderCache[cacheKey] || {};
        folders.forEach(function (f) {
            if (f && Number(f.resType) === 2 && f.fileName) map[f.fileName] = String(f.fileId);
        });
        if (map[name]) return map[name];

        var r = await resApi('/file/create_dir', {
            dirName: name,
            parentId: String(parentId || ''),
            failIfNameExist: true
        });
        var ret = parseApiResult(r);
        if (ret.ok && ret.json && ret.json.data && ret.json.data.fileId) {
            map[name] = String(ret.json.data.fileId);
            return map[name];
        }
        // 同名目录已存在时会报错，回查一次复用
        folders = await fetchFolderEntries(parentId);
        folders.forEach(function (f) {
            if (f && Number(f.resType) === 2 && f.fileName) map[f.fileName] = String(f.fileId);
        });
        if (map[name]) return map[name];
        throw new Error('创建目录「' + name + '」失败：' + (ret.msg || '未知错误'));
    }

    async function moveIntoFolder(fileIds, parentId) {
        var ids = Array.from(new Set((fileIds || [])
            .map(function (id) { return String(id || '').trim(); })
            .filter(Boolean)));
        for (var i = 0; i < ids.length; i += 100) {
            var chunk = ids.slice(i, i + 100);
            var r = await resApi('/file/move_file', {
                fileIds: chunk,
                parentId: String(parentId || '')
            });
            var ret = parseApiResult(r);
            if (!ret.ok) throw new Error('移动失败：' + (ret.msg || '未知错误'));
            if (i + 100 < ids.length) await sleep(300);
        }
    }

    async function runOrganize(parentId, groups) {
        var overlay = buildBatchOverlay(groups.length, '🗂 同剧归类');
        var titleEl = overlay.querySelector('.gyp-b-title');
        var logEl = overlay.querySelector('.gyp-b-log');
        var statusEl = overlay.querySelector('.gyp-b-status');
        var stopBtn = overlay.querySelector('.gyp-b-stop');
        var doneBtn = overlay.querySelector('.gyp-b-done');
        var stopped = false;
        var moved = 0;
        var failed = 0;

        function logLine(text, color) {
            var line = document.createElement('div');
            if (color) line.style.color = color;
            line.textContent = text;
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
        }

        stopBtn.addEventListener('click', function () {
            stopped = true;
            stopBtn.disabled = true;
            stopBtn.textContent = '停止中…';
        });
        doneBtn.addEventListener('click', function () { overlay.remove(); });

        for (var i = 0; i < groups.length; i++) {
            if (stopped) break;
            var group = groups[i];
            titleEl.textContent = '🗂 同剧归类（' + (i + 1) + '/' + groups.length + '）';
            statusEl.textContent = '正在处理：' + group.name;
            try {
                var dirId = await ensureFolder(parentId, group.name);
                await moveIntoFolder(group.files.map(function (f) { return f.fileId; }), dirId);
                moved += group.files.length;
                logLine('✓ ' + group.name + '（' + group.files.length + ' 个文件）', '#16a34a');
            } catch (e) {
                failed++;
                logLine('✗ ' + group.name + '：' + (e && e.message ? e.message : e), '#dc2626');
            }
            await sleep(250);
        }

        titleEl.textContent = '🗂 同剧归类（已结束）';
        statusEl.textContent = '归类 ' + moved + ' 个文件，失败 ' + failed + ' 组' +
            (stopped ? '（已手动停止）' : '') + '；完成后请刷新页面';
        stopBtn.style.display = 'none';
        doneBtn.style.display = '';
        organizing = false;
    }

    async function organizeCurrentFolder() {
        if (!isGuangyaPageHost()) { alert('请先在光鸭云盘里打开要整理的文件夹'); return; }
        if (organizing) { alert('正在整理，请稍候'); return; }
        if (!getToken()) { alert('未获取到光鸭 Token，请先登录光鸭云盘'); return; }
        var parentId = currentFolderIdFromUrl();
        if (!parentId) { alert('没识别到当前文件夹 ID，请进入具体文件夹后再试'); return; }

        organizing = true;
        try {
            var files = await fetchFolderEntries(parentId);
            if (!files.length) {
                organizing = false;
                alert('没从当前文件夹读到任何条目（parentId=' + parentId + '）。\n请确认是在文件夹视图里，且该目录不是空的。');
                return;
            }
            var groups = collectSeriesGroups(files);
            if (!groups.length) {
                organizing = false;
                alert('读到 ' + files.length + ' 个条目，但没有识别出「同一部剧的多个文件」。\n\n前几个文件名：\n' +
                    files.slice(0, 6).map(function (f) { return f.fileName; }).join('\n'));
                return;
            }
            var summary = groups.map(function (g) {
                return g.name + '  ←  ' + g.files.length + ' 个文件';
            }).join('\n');
            if (!confirm('识别到 ' + groups.length + ' 组同剧文件，将各建一个同名文件夹并移入：\n\n' +
                summary + '\n\n继续？')) {
                organizing = false;
                return;
            }
            await runOrganize(parentId, groups);
        } catch (e) {
            organizing = false;
            alert('整理失败：' + (e && e.message ? e.message : e));
        }
    }

    /* =========================================================================
     * 目录选择器（文件树，懒加载下级）
     * ========================================================================= */
    function fetchFileList(parentId) {
        var pid = parentId == null ? '' : String(parentId);
        var PAGE_SIZE = 100;
        var MAX_PAGES = 10;
        var collected = [];

        function loadPage(page) {
            return gmRequest('POST', FILE_LIST_URL, {
                page: page,
                pageSize: PAGE_SIZE,
                parentId: pid,
                resType: 2,
                needSubFolderStat: true
            }).then(function (r) {
                var ret = parseApiResult(r);
                if (!ret.ok || !ret.json || !ret.json.data) {
                    throw new Error(ret.msg || ('HTTP ' + r.status));
                }
                var list = ret.json.data.list || [];
                collected = collected.concat(list);
                if (list.length >= PAGE_SIZE && page + 1 < MAX_PAGES) {
                    return loadPage(page + 1);
                }
                return collected;
            });
        }

        return loadPage(0);
    }

    function updateFolderPickRow(body, folder) {
        var pick = body.querySelector('.gyp-folder-pick');
        if (!pick) return;
        pick.querySelector('.gyp-fp-name').textContent = folder.name || '';
        var pathStr = folder.path && folder.path.length ? folder.path.join(' / ') : '';
        pick.querySelector('.gyp-fp-path').textContent = pathStr;
    }

    function closeFolderPicker() {
        var p = document.getElementById('gyp-folder-picker');
        if (p) p.remove();
    }

    function openFolderPicker(onConfirm) {
        closeFolderPicker();
        var overlay = document.createElement('div');
        overlay.id = 'gyp-folder-picker';
        overlay.innerHTML =
            '<div class="gyp-modal gyp-folder-modal">' +
            '  <div class="gyp-header"><span>📁 选择保存目录</span><button class="gyp-close" title="关闭">×</button></div>' +
            '  <div class="gyp-folder-path"></div>' +
            '  <div class="gyp-body gyp-tree"><div class="gyp-loading"><div class="gyp-spinner"></div><br>正在加载目录…</div></div>' +
            '  <div class="gyp-footer">' +
            '    <span class="gyp-status"></span>' +
            '    <button class="gyp-btn gyp-btn-ghost gyp-cancel">取消</button>' +
            '    <button class="gyp-btn gyp-btn-primary gyp-confirm" disabled>选择此目录</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(overlay);

        var tree = overlay.querySelector('.gyp-tree');
        var pathEl = overlay.querySelector('.gyp-folder-path');
        var confirmBtn = overlay.querySelector('.gyp-confirm');
        var statusEl = overlay.querySelector('.gyp-status');
        var picked = null;

        overlay.querySelector('.gyp-close').addEventListener('click', closeFolderPicker);
        overlay.querySelector('.gyp-cancel').addEventListener('click', closeFolderPicker);
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeFolderPicker(); });
        confirmBtn.addEventListener('click', function () {
            if (picked) onConfirm(picked);
            closeFolderPicker();
        });

        function getPathOfNode(li) {
            if (li.dataset.id === '') return []; // 根目录
            var path = [];
            var cur = li;
            while (cur && cur.classList && cur.classList.contains('gyp-fnode')) {
                path.unshift(cur.dataset.name);
                cur = cur.parentElement ? cur.parentElement.closest('.gyp-fnode') : null;
            }
            return path;
        }

        function selectNode(li) {
            var prev = tree.querySelectorAll('.gyp-fnode.sel');
            Array.prototype.forEach.call(prev, function (n) { n.classList.remove('sel'); });
            li.classList.add('sel');
            var path = getPathOfNode(li);
            picked = { id: li.dataset.id, name: li.dataset.name, path: path };
            pathEl.textContent = path.length ? path.join(' / ') : li.dataset.name;
            confirmBtn.disabled = false;
            statusEl.textContent = '';
            statusEl.className = 'gyp-status';
        }

        function wireNode(li) {
            var row = li.querySelector('.gyp-frow');
            var toggle = li.querySelector('.gyp-toggle');
            row.addEventListener('click', function (e) {
                if (e.target === toggle) return;
                selectNode(li);
            });
            if (toggle) {
                toggle.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (!toggle.textContent.trim()) return; // 叶子节点
                    toggleNode(li);
                });
            }
        }

        function makeNode(f, depth) {
            var hasChild = (Number(f.subFolderCount) || 0) > 0;
            var li = document.createElement('li');
            li.className = 'gyp-fnode';
            li.dataset.id = f.fileId;
            li.dataset.name = f.fileName;
            li.dataset.depth = depth;
            li.dataset.loaded = '0';
            li.dataset.expanded = '0';
            li.innerHTML =
                '<div class="gyp-frow" style="padding-left:' + (depth * 18 + 8) + 'px">' +
                '<span class="gyp-toggle">' + (hasChild ? '▶' : '') + '</span>' +
                '<span class="gyp-radio"></span>' +
                '<span class="gyp-ficon">📁</span>' +
                '<span class="gyp-fname" title="' + escapeHtml(f.fileName) + '">' + escapeHtml(f.fileName) + '</span>' +
                '<span class="gyp-fcount">' + (hasChild ? f.subFolderCount : '') + '</span>' +
                '</div>' +
                '<ul class="gyp-children" style="display:none"></ul>';
            wireNode(li);
            return li;
        }

        function renderNodes(container, folders, depth) {
            folders.forEach(function (f) { container.appendChild(makeNode(f, depth)); });
        }

        function loadChildren(li) {
            var children = li.querySelector('.gyp-children');
            var toggle = li.querySelector('.gyp-toggle');
            var depth = parseInt(li.dataset.depth, 10) + 1;
            children.innerHTML = '<li class="gyp-loading-row">加载中…</li>';
            children.style.display = '';
            toggle.textContent = '⏳';
            fetchFileList(li.dataset.id).then(function (folders) {
                children.innerHTML = '';
                li.dataset.loaded = '1';
                li.dataset.expanded = '1';
                if (folders.length === 0) { toggle.textContent = ''; return; } // 实际无子目录
                toggle.textContent = '▼';
                renderNodes(children, folders, depth);
            }).catch(function (e) {
                children.innerHTML = '<li class="gyp-loading-row" style="color:#dc2626;">加载失败：' + escapeHtml(e.message) + '</li>';
                toggle.textContent = '▶';
                li.dataset.loaded = '0';
            });
        }

        function toggleNode(li) {
            var children = li.querySelector('.gyp-children');
            var toggle = li.querySelector('.gyp-toggle');
            if (li.dataset.expanded === '1') {
                children.style.display = 'none';
                toggle.textContent = '▶';
                li.dataset.expanded = '0';
            } else if (li.dataset.loaded === '1') {
                children.style.display = '';
                toggle.textContent = '▼';
                li.dataset.expanded = '1';
            } else {
                loadChildren(li);
            }
        }

        // 加载根目录列表
        fetchFileList('').then(function (folders) {
            tree.innerHTML = '';
            renderNodes(tree, folders, 0);
            // 查找”来自：云添加”文件夹
            var targetFolder = null;
            var targetNode = null;
            Array.prototype.some.call(tree.querySelectorAll('.gyp-fnode'), function (n) {
                if (n.dataset.name === '来自：云添加') {
                    targetNode = n;
                    targetFolder = {
                        id: n.dataset.id,
                        name: n.dataset.name,
                        path: [n.dataset.name]
                    };
                    return true;
                }
                return false;
            });
            // 如果找到且还没有保存的目录，则持久化保存
            if (targetFolder && !GM_getValue('gyp_selected_folder', null)) {
                setSelectedFolder(targetFolder);
            }
            // 默认选中逻辑：
            // 1. 如果已保存的目录在一级目录中（depth === 0），则选中它
            // 2. 否则，不默认选中任何文件夹
            var saved = getSelectedFolder();
            var nodeToSelect = null;
            var allNodes = tree.querySelectorAll('.gyp-fnode');
            if (saved && saved.id !== '') {
                // 尝试在树中找到已保存的目录节点
                Array.prototype.some.call(allNodes, function (n) {
                    if (sameId(n.dataset.id, saved.id)) {
                        // 仅当节点在一级目录（depth === 0）时才选中它
                        if (parseInt(n.dataset.depth, 10) === 0) {
                            nodeToSelect = n;
                        }
                        return true;
                    }
                    return false;
                });
            }
            // 只有找到合适的节点才选中，否则不选中任何文件夹
            if (nodeToSelect) {
                selectNode(nodeToSelect);
            }
        }).catch(function (e) {
            tree.innerHTML = '<div class="gyp-error">❌ 目录加载失败：' + escapeHtml(e.message) + '</div>';
            statusEl.textContent = '加载失败，请检查 Token';
            statusEl.className = 'gyp-status err';
        });
    }

    /* =========================================================================
     * 弹窗（解析结果 / 创建任务）
     * ========================================================================= */
    function escClose(e) {
        if (e.key !== 'Escape') return;
        if (document.getElementById('gyp-folder-picker')) closeFolderPicker();
        else closeOverlay();
    }
    function closeOverlay() {
        var ov = document.getElementById('gyp-overlay');
        if (ov) ov.remove();
        document.removeEventListener('keydown', escClose);
    }

    function buildModal() {
        var overlay = document.createElement('div');
        overlay.id = 'gyp-overlay';
        overlay.innerHTML =
            '<div class="gyp-modal" role="dialog" aria-modal="true">' +
            '  <div class="gyp-header"><span><img src="' + GUANGYA_LOGO + '" class="gyp-header-icon"> 光鸭云盘 · 离线下载</span><button class="gyp-close" title="关闭">×</button></div>' +
            '  <div class="gyp-body"></div>' +
            '  <div class="gyp-footer">' +
            '    <span class="gyp-status"></span>' +
            '    <button class="gyp-btn gyp-btn-primary gyp-add" style="display:none;">立即添加</button>' +
            '    <button class="gyp-btn gyp-btn-ghost gyp-cancel">取消</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(overlay);
        overlay.querySelector('.gyp-close').addEventListener('click', closeOverlay);
        overlay.querySelector('.gyp-cancel').addEventListener('click', closeOverlay);
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeOverlay(); });
        document.addEventListener('keydown', escClose);
        return overlay;
    }

    function setStatus(el, text, cls) {
        el.textContent = text;
        el.className = 'gyp-status' + (cls ? ' ' + cls : '');
    }
    function showErrorBody(body, status, msg) {
        body.innerHTML = '<div class="gyp-error">❌ ' + escapeHtml(msg) + '</div>';
        setStatus(status, '操作失败', 'err');
    }

    // 弹窗提示用户补充 Token：前往光鸭云盘自动获取 或 手动输入
    function promptAndSaveToken() {
        var v = prompt('请输入光鸭云盘的 Authorization（形如 "Bearer eyJ..."）：', getToken());
        if (v == null) return false;
        var trimmed = v.trim();
        if (trimmed) {
            GM_setValue('gyp_token', trimmed);
            return true;
        }
        return false;
    }

    function openGuangyaPage() {
        var url = 'https://www.guangyapan.com/';
        try {
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(url, { active: true });
                return;
            }
        } catch (e) {}
        window.open(url, '_blank');
    }

    function renderTokenMissing(overlay, magnet) {
        var body = overlay.querySelector('.gyp-body');
        var status = overlay.querySelector('.gyp-status');
        setStatus(status, '未获取到登录凭证', 'err');
        body.innerHTML =
            '<div class="gyp-error">⚠️ 未获取到光鸭云盘的登录凭证（Token）</div>' +
            '<div style="margin-top:10px;line-height:1.7;color:#6b7280;font-size:13px;">请选择获取方式：</div>' +
            '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
            '<button class="gyp-btn gyp-btn-primary gyp-goto">前往光鸭云盘自动获取</button>' +
            '<button class="gyp-btn gyp-btn-ghost gyp-manual">手动输入 Token</button>' +
            '</div>' +
            '<div style="margin-top:12px;color:#9ca3af;font-size:12px;line-height:1.6;">前往光鸭云盘并登录后，Token 会自动嗅探并保存；返回本页重新点击云添加即可继续。</div>';
        var gotoBtn = body.querySelector('.gyp-goto');
        var manualBtn = body.querySelector('.gyp-manual');
        if (gotoBtn) {
            gotoBtn.addEventListener('click', function () {
                openGuangyaPage();
                closeOverlay();
            });
        }
        if (manualBtn) {
            manualBtn.addEventListener('click', function () {
                if (promptAndSaveToken()) {
                    closeOverlay();
                    onCloudAdd(magnet);
                }
            });
        }
    }

    // 主流程：点击“云添加"
    function onCloudAdd(magnet) {
        if (document.getElementById('gyp-overlay')) return; // 避免重复弹窗
        var overlay = buildModal();
        var body = overlay.querySelector('.gyp-body');
        var status = overlay.querySelector('.gyp-status');
        var addBtn = overlay.querySelector('.gyp-add');

        // 无 Token：提示前往光鸭云盘自动获取或手动输入，不发起解析请求
        if (!getToken()) {
            renderTokenMissing(overlay, magnet);
            return;
        }

        body.innerHTML = '<div class="gyp-loading"><div class="gyp-spinner"></div><br>正在解析磁力链接…</div>';
        setStatus(status, '解析中…', '');

        gmRequest('POST', RESOLVE_URL, { url: magnet }).then(function (r) {
            var ret = parseApiResult(r);
            if (!ret.ok || !ret.json || !ret.json.data) {
                showErrorBody(body, status, '解析失败：' + ret.msg);
                return;
            }
            renderResult(overlay, magnet, ret.json.data);
        }).catch(function (e) {
            showErrorBody(body, status, '解析请求失败：' + e.message);
        });
    }

    // 渲染解析结果
    function renderResult(overlay, magnet, data) {
        var body = overlay.querySelector('.gyp-body');
        var status = overlay.querySelector('.gyp-status');
        var addBtn = overlay.querySelector('.gyp-add');
        addBtn.style.display = '';

        var bt = data.btResInfo || {};
        var subfiles = collectResolvedFiles(data);
        // 接口没给文件列表但有种子名/大小时，造一个虚拟文件仅用于展示
        if (subfiles.length === 0 && bt.fileName && bt.fileSize != null) {
            subfiles = [{
                fileName: bt.fileName,
                fileSize: bt.fileSize
            }];
        }
        var url = data.url || magnet;
        var seriesName = detectSeriesName(bt.fileName || (subfiles[0] && subfiles[0].fileName) || '');
        var seriesDir = seriesName ? sanitizeDirName(seriesName) : '';
        var autoSeries = autoSeriesEnabled() && !!seriesDir;

        // 计算实际文件数量（不包括文件夹）
        function countFiles(files) {
            var count = 0;
            files.forEach(function (f) {
                if (f.isDir === true) {
                    if (f.subfiles) {
                        count += countFiles(f.subfiles);
                    }
                } else {
                    count++;
                }
            });
            return count;
        }
        var totalFileCount = countFiles(subfiles);

        body.innerHTML =
            '<div class="gyp-row gyp-multi-info">' +
            '<div class="gyp-info-item"><span class="gyp-info-label">总大小</span><span class="gyp-info-value">' + escapeHtml(formatSize(bt.fileSize)) + '</span></div>' +
            '<div class="gyp-info-item"><span class="gyp-info-label">文件数</span><span class="gyp-info-value">' + escapeHtml(String(bt.subfilesNum != null ? bt.subfilesNum : totalFileCount)) + '</span></div>' +
            '<div class="gyp-info-item"><span class="gyp-info-label">创建时间</span><span class="gyp-info-value">' + escapeHtml(formatTime(bt.createTime)) + '</span></div>' +
            '</div>' +
            '<div class="gyp-row"><div class="gyp-label">添加到</div><div class="gyp-value">' +
            '<div class="gyp-folder-pick" title="点击选择保存目录">' +
            '<span class="gyp-fp-icon">📁</span>' +
            '<span class="gyp-fp-name"></span>' +
            '<span class="gyp-fp-path"></span>' +
            '<span class="gyp-fp-arrow">更改 ▾</span>' +
            '</div></div>' +
            '<div class="gyp-row"><div class="gyp-label">同剧归类</div><div class="gyp-value">' +
            (autoSeries
                ? '<span style="color:#16a34a;">✓ 自动放入子文件夹「' + escapeHtml(seriesDir) + '」</span>'
                : '<span style="color:#9ca3af;">未开启（油猴菜单里可切换）</span>') +
            '</div></div>' +
            '<div class="gyp-subhead"><span class="gyp-selected-count">已选 ' + getInitialSelectedCount() + ' 个</span><span class="gyp-toggle">全选 / 反选</span></div>' +
            '<ul class="gyp-sublist"></ul>';

        // 扁平化存储所有文件，用于收集选中的索引
        var allFiles = [];
        var fileIndex = 0;

        // 计算初始选中的文件数量（只统计文件，不统计文件夹）
        function getInitialSelectedCount() {
            var count = 0;
            for (var i = 0; i < subfiles.length; i++) {
                var f = subfiles[i];
                if (f.isDir === true) {
                    // 递归统计文件夹下的文件
                    if (f.subfiles) {
                        count += countSelectedInFolder(f.subfiles);
                    }
                } else {
                    if (isSelectableVideo(f)) {
                        count++;
                    }
                }
            }
            return count;
        }

        // 递归统计文件夹下选中的文件数量
        function countSelectedInFolder(files) {
            var count = 0;
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                if (f.isDir === true) {
                    if (f.subfiles) {
                        count += countSelectedInFolder(f.subfiles);
                    }
                } else {
                    if (isSelectableVideo(f)) {
                        count++;
                    }
                }
            }
            return count;
        }

        // 更新已选文件数量显示
        function updateSelectedCount() {
            var checks = body.querySelectorAll('.gyp-check:checked');
            var count = 0;
            Array.prototype.forEach.call(checks, function (c) {
                var idx = Number(c.dataset.i);
                var fileInfo = allFiles[idx];
                if (fileInfo && fileInfo.file.isDir !== true) {
                    count++;
                }
            });
            var countSpan = body.querySelector('.gyp-selected-count');
            if (countSpan) {
                countSpan.textContent = '已选 ' + count + ' 个';
            }
        }

        // 递归渲染文件/文件夹：记录 depth 和所属顶层项的位置，用于生成 fileIndexes
        function renderFileList(container, files, depth, topIndex) {
            files.forEach(function (f, filePos) {
                var currentIndex = fileIndex++;
                var top = depth === 0 ? filePos : topIndex;
                allFiles.push({ file: f, index: currentIndex, depth: depth, topIndex: top });

                var li = document.createElement('li');
                li.className = 'gyp-subitem';
                li.style.paddingLeft = (depth * 16 + 10) + 'px';

                var isDir = f.isDir === true;
                var checked = '';
                var sizeText = '';
                var icon = '📄';
                var toggleHtml = '';

                if (isDir) {
                    icon = '📁';
                    sizeText = '-';
                    // 文件夹不勾选
                    checked = '';
                    // 如果有子文件，添加展开按钮
                    if (f.subfiles && f.subfiles.length > 0) {
                        toggleHtml = '<span class="gyp-subtoggle" data-expanded="false">▶</span>';
                    } else {
                        toggleHtml = '<span class="gyp-subtoggle"></span>';
                    }
                } else {
                    checked = isSelectableVideo(f) ? ' checked' : '';
                    sizeText = formatSize(f.fileSize);
                    toggleHtml = '<span class="gyp-subtoggle"></span>';
                }

                li.innerHTML =
                    toggleHtml +
                    '<input type="checkbox" class="gyp-check" data-i="' + currentIndex + '"' + checked + '>' +
                    '<span class="gyp-custom-checkbox"></span>' +
                    '<span class="gyp-subicon">' + icon + '</span>' +
                    '<span class="gyp-subname" title="' + escapeHtml(f.fileName) + '">' + escapeHtml(f.fileName) + '</span>' +
                    '<span class="gyp-subsize">' + escapeHtml(sizeText) + '</span>';

                container.appendChild(li);

                // 添加自定义复选框点击事件
                var customCheckbox = li.querySelector('.gyp-custom-checkbox');
                var checkbox = li.querySelector('.gyp-check');
                if (customCheckbox && checkbox) {
                    customCheckbox.addEventListener('click', function (e) {
                        e.preventDefault();
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    });
                }

                // 如果是文件，添加change事件，可能需要更新父文件夹状态
                if (!isDir) {
                    var checkbox = li.querySelector('.gyp-check');
                    if (checkbox) {
                        checkbox.addEventListener('change', function () {
                            // 更新已选数量
                            updateSelectedCount();
                            // 向上遍历，更新父文件夹状态
                            var parent = container.parentElement;
                            while (parent && parent.classList) {
                                if (parent.classList.contains('gyp-subchildren')) {
                                    var parentLi = parent.previousElementSibling;
                                    if (parentLi) {
                                        var parentCheck = parentLi.querySelector('.gyp-check');
                                        if (parentCheck) {
                                            var siblingChecks = parent.querySelectorAll('.gyp-check');
                                            var allChecked = Array.prototype.every.call(siblingChecks, function (c) { return c.checked; });
                                            var noneChecked = Array.prototype.every.call(siblingChecks, function (c) { return !c.checked; });
                                            parentCheck.checked = allChecked;
                                            parentCheck.indeterminate = !allChecked && !noneChecked;
                                        }
                                    }
                                    parent = parent.parentElement;
                                } else {
                                    break;
                                }
                            }
                        });
                    }
                }

                // 如果是文件夹且有子文件，添加子容器
                if (isDir && f.subfiles && f.subfiles.length > 0) {
                    var childContainer = document.createElement('ul');
                    childContainer.className = 'gyp-subchildren';
                    childContainer.style.display = 'none';
                    childContainer.style.listStyle = 'none';
                    childContainer.style.margin = '0';
                    childContainer.style.padding = '0';
                    container.appendChild(childContainer);

                    // 递归渲染子文件
                    renderFileList(childContainer, f.subfiles, depth + 1, top);

                    // 添加展开/收起事件
                    var toggle = li.querySelector('.gyp-subtoggle');
                    if (toggle && toggle.textContent) {
                        toggle.addEventListener('click', function () {
                            var expanded = toggle.dataset.expanded === 'true';
                            if (expanded) {
                                childContainer.style.display = 'none';
                                toggle.textContent = '▶';
                                toggle.dataset.expanded = 'false';
                            } else {
                                childContainer.style.display = 'block';
                                toggle.textContent = '▼';
                                toggle.dataset.expanded = 'true';
                            }
                        });
                    }

                    // 添加文件夹checkbox事件：全选/取消全选子文件
                    var checkbox = li.querySelector('.gyp-check');
                    if (checkbox) {
                        checkbox.addEventListener('change', function () {
                            var checked = checkbox.checked;
                            // 找到此文件夹下的所有子checkbox
                            var childChecks = childContainer.querySelectorAll('.gyp-check');
                            childChecks.forEach(function (c) {
                                c.checked = checked;
                                c.indeterminate = false;
                                // 触发子checkbox的change事件，以处理嵌套文件夹
                                c.dispatchEvent(new Event('change'));
                            });
                        });
                    }
                }
            });
        }

        var list = body.querySelector('.gyp-sublist');
        renderFileList(list, subfiles, 0, -1);

        // 初始化所有文件夹的勾选状态（倒序处理，先算子文件夹再算父文件夹）
        function initFolderCheckboxes(container) {
            var items = Array.prototype.slice.call(container.querySelectorAll('.gyp-subitem'));
            for (var i = items.length - 1; i >= 0; i--) {
                var item = items[i];
                var next = item.nextElementSibling;
                if (next && next.classList && next.classList.contains('gyp-subchildren')) {
                    var childChecks = next.querySelectorAll('.gyp-check');
                    if (childChecks.length > 0) {
                        var checkbox = item.querySelector('.gyp-check');
                        if (checkbox) {
                            var allChecked = Array.prototype.every.call(childChecks, function (c) { return c.checked; });
                            var noneChecked = Array.prototype.every.call(childChecks, function (c) { return !c.checked; });
                            checkbox.checked = allChecked;
                            checkbox.indeterminate = !allChecked && !noneChecked;
                        }
                    }
                }
            }
        }
        initFolderCheckboxes(list);

        var toggleBtn = body.querySelector('.gyp-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var checks = body.querySelectorAll('.gyp-check');
                // 只统计文件的选中状态，不统计文件夹
                var fileChecks = Array.prototype.filter.call(checks, function (c) {
                    var idx = Number(c.dataset.i);
                    var fileInfo = allFiles[idx];
                    return fileInfo && fileInfo.file.isDir !== true;
                });
                var allChecked = Array.prototype.every.call(fileChecks, function (c) { return c.checked; });
                Array.prototype.forEach.call(fileChecks, function (c) {
                    c.checked = !allChecked;
                    c.dispatchEvent(new Event('change'));
                });
            });
        }

        setStatus(status, '解析完成，请选择文件后点击”立即添加”', '');

        // “添加到”目录选择 - 先显示当前选择，然后尝试查找”来自：云添加”
        updateFolderPickRow(body, getSelectedFolder());
        var folderPick = body.querySelector('.gyp-folder-pick');
        if (folderPick) {
            folderPick.addEventListener('click', function () {
                openFolderPicker(function (picked) {
                    setSelectedFolder(picked);
                    updateFolderPickRow(body, picked);
                });
            });
        }

        // 如果还没有保存的目录，自动加载目录列表并查找"来自：云添加"
        if (!GM_getValue('gyp_selected_folder', null)) {
            fetchFileList('').then(function (folders) {
                var targetFolder = null;
                folders.forEach(function (f) {
                    if (f.fileName === '来自：云添加') {
                        targetFolder = {
                            id: String(f.fileId),
                            name: f.fileName,
                            path: [f.fileName]
                        };
                    }
                });
                if (targetFolder) {
                    setSelectedFolder(targetFolder);
                    updateFolderPickRow(body, targetFolder);
                }
            }).catch(function (e) {
                // 静默失败，不影响用户使用
            });
        }

        // 立即添加 → create_task
        addBtn.onclick = async function () {
            var checks = body.querySelectorAll('.gyp-check:checked');
            var selected = [];
            Array.prototype.forEach.call(checks, function (c) {
                var idx = Number(c.dataset.i);
                var fileInfo = allFiles[idx];
                if (fileInfo && fileInfo.file.isDir !== true) selected.push(fileInfo);
            });
            if (selected.length === 0) {
                setStatus(status, '请至少选择一个文件', 'err');
                return;
            }
            if (addBtn.disabled) return;
            addBtn.disabled = true;

            var built = buildFileIndexes(selected);
            var folder = getSelectedFolder();
            var targetParentId = String(folder.id == null ? '' : folder.id);
            var dirNote = '';

            // 同剧归类：先确保同名子文件夹存在，再把任务建到里面
            if (autoSeries) {
                setStatus(status, '正在准备「' + seriesDir + '」目录…', '');
                try {
                    targetParentId = await ensureFolder(targetParentId, seriesDir);
                } catch (e) {
                    dirNote = '（建目录失败，已放回所选目录）';
                }
            }

            // 与光鸭网页端/V4 助手保持一致：只传 fileIndexes / url / parentId，不传 newName
            var reqBody = {
                url: url,
                parentId: targetParentId
            };
            // 识别不到序号时不传该字段，让服务端按整包处理
            if (built.indexes.length) reqBody.fileIndexes = built.indexes;
            setStatus(status, '正在创建任务…', '');
            gmRequest('POST', CREATE_URL, reqBody).then(function (r) {
                var ret = parseApiResult(r);
                if (ret.ok) {
                    var note = '';
                    if (built.mode === 'all') note = '（未识别到文件序号，已按整包添加）';
                    else if (built.mode === 'partial') note = '（部分文件无序号，已按识别到的添加）';
                    if (autoSeries && !dirNote) note += '，已归入「' + seriesDir + '」';
                    setStatus(status, '✓ 添加成功！任务已创建' + note + dirNote, 'ok');
                    addBtn.textContent = '完成';
                    addBtn.disabled = false;
                    addBtn.onclick = closeOverlay;
                } else {
                    setStatus(status, '添加失败：' + ret.msg, 'err');
                    addBtn.disabled = false;
                }
            }).catch(function (e) {
                setStatus(status, '添加请求失败：' + e.message, 'err');
                addBtn.disabled = false;
            });
        };
    }
})();
