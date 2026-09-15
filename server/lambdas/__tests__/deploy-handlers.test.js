/**
 * Deploy smoke test: every Lambda declared in template.yaml must resolve to a
 * module that actually exports the configured handler.
 *
 * This is the class of failure that shipped endConversation with only a
 * `handlerLogic` and no `exports.handler` — AWS accepted the deploy and the
 * function then failed to load on every invocation.
 */
const fs = require('fs');
const path = require('path');

const LAMBDAS_ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(LAMBDAS_ROOT, 'template.yaml');

// Handler entries look like `Handler: endConversation/index.handler`.
function declaredHandlers() {
    const template = fs.readFileSync(TEMPLATE, 'utf8');
    const handlers = [];
    for (const match of template.matchAll(/^\s*Handler:\s*([\w./-]+)$/gm)) {
        handlers.push(match[1]);
    }
    return handlers;
}

describe('template.yaml handlers', () => {
    const handlers = declaredHandlers();

    test('declares the expected set of functions', () => {
        expect(handlers).toHaveLength(10);
        expect(new Set(handlers).size).toBe(handlers.length);
    });

    test.each(handlers)('%s resolves to an exported function', (spec) => {
        const [file, exportName] = spec.split('.');
        const modulePath = path.join(LAMBDAS_ROOT, `${file}.js`);
        expect(fs.existsSync(modulePath)).toBe(true);

        let mod;
        jest.isolateModules(() => {
            // eslint-disable-next-line global-require, import/no-dynamic-require
            mod = require(modulePath);
        });
        expect(typeof mod[exportName]).toBe('function');
    });
});
