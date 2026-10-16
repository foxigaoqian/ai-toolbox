import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {EDITOR_CLIENT} from '../src/editor-client.js';
import {XHS_CLIENT} from '../src/xhs-client.js';

const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const htmlLine=source.split('\n').find(line=>line.startsWith('const HTML='));
assert.ok(htmlLine,'homepage source exists');
const html=JSON.parse(htmlLine.slice('const HTML='.length,-1));
const toolsLine=source.split('\n').find(line=>line.startsWith('const TOOLS='));
const tools=JSON.parse(toolsLine.slice('const TOOLS='.length,-1));

test('All browser scripts compile without syntax errors',()=>{
 const main=html.match(/<script>\s*(\(function\(\)\{[\s\S]*?)<\/script>/);
 assert.ok(main,'homepage inline script found');
 assert.doesNotThrow(()=>new Script(main[1],{filename:'homepage.js'}));
 assert.doesNotThrow(()=>new Script(EDITOR_CLIENT,{filename:'editor-app.js'}));
 assert.doesNotThrow(()=>new Script(XHS_CLIENT,{filename:'xhs-app.js'}));
});

test('Task-first homepage keeps real tool entrypoints',()=>{
 assert.match(html,/id="quick-start"/);
 for(const id of ['tool-01','tool-02','tool-04','tool-26'])assert.ok(html.includes('href="/tools/'+id+'"'),'missing dedicated page link '+id);
 assert.match(html,/var chosen='ready'/);
 assert.match(html,/tool-page-mode/);
 assert.match(html,/tool-page-breadcrumb/);
 assert.doesNotMatch(html,/<button data-tool="tool-01" class="task-card">/);
 assert.match(html,/ai-text-prompt/);
 assert.equal(tools.length,46);
 assert.equal(tools.filter(t=>t.status!=='needs-model').length,18);
});

test('Draft and overflow guards are present',()=>{
 assert.match(EDITOR_CLIENT,/ai-toolbox\.editor-draft\.v1/);
 assert.match(EDITOR_CLIENT,/multi-project-download/);
 assert.match(EDITOR_CLIENT,/multi-project-import/);
 assert.match(EDITOR_CLIENT,/dataset\.overflow/);
 assert.match(EDITOR_CLIENT,/draftEvents\.abort\(\)/);
});

test('Xiaohongshu workspace exposes a direct path to editing',()=>{
 assert.match(XHS_CLIENT,/xhs-direct-editor/);
 assert.match(XHS_CLIENT,/xhs-form\.v1/);
 assert.match(XHS_CLIENT,/高级选项/);
 assert.match(XHS_CLIENT,/无需生图，直接进入套图编辑器/);
});
