import test from 'node:test';
import assert from 'node:assert/strict';

import { scenarios } from '../desk-simulator-data.mjs';

test('the options P&L incident arithmetic reconciles', () => {
    const scenario = scenarios.find((item) => item.id === 'vol-snapshot');
    const bridge = scenario.artifacts.find((item) => item.id === 'pnl-bridge');
    const componentValuesInThousands = [420, 34, 828, -48, 186];
    assert.equal(
        componentValuesInThousands.reduce((sum, value) => sum + value, 0),
        1420
    );
    assert.equal(bridge.rows.at(-1)[1], '+$1.420m');

    const officialPnlInThousands = 610;
    const bookVegaPerPointInThousands = 331;
    const missingVolPoints = 2.4;
    const correctedPnl = officialPnlInThousands + bookVegaPerPointInThousands * missingVolPoints;
    assert.ok(Math.abs(correctedPnl - 1405) < 1);
});

test('each incident discloses its educational objective and worked explanation', () => {
    scenarios.forEach((scenario) => {
        assert.ok(scenario.objective.length > 60, scenario.id);
        assert.ok(scenario.answer.explanation.length > 120, scenario.id);
        assert.ok(scenario.answer.learning.length >= 3, scenario.id);
        assert.ok(scenario.nextSteps.length >= 2, scenario.id);
    });
});
