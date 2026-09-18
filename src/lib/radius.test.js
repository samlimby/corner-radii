import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VALUES, LIMITS, innerRadius, nextValues, needsExpandedPreview, previewScale } from './radius.js';

test('nested radii match known examples, including square inner corners', () => {
  for (const [outer, padding, expected] of [[40,20,20],[48,4,44],[48,48,0],[40,100,0],[0,0,0],[48,0,48]]) {
    assert.equal(innerRadius(outer, padding), expected);
  }
});

test('every allowed outer/padding/size combination has concentric positive corners', () => {
  for (let outer=0; outer<=48; outer+=4) {
    for (let padding=0; padding<=100; padding+=4) {
      for (let size=160; size<=360; size+=4) {
        const result = nextValues(nextValues(nextValues(DEFAULT_VALUES, 'outer', outer), 'padding', padding), 'size', size);
        assert.equal(result.inner, Math.max(0, outer-padding));
        assert.ok(result.inner >= 0 && result.inner <= result.outer);
        // No CSS overlap normalization is needed in the supported size range.
        assert.ok(result.outer * 2 <= size + padding * 2);
        assert.ok(result.inner * 2 <= size);
        if (result.inner > 0) assert.equal(padding + result.inner, result.outer);
      }
    }
  }
});

test('inverse slider respects the outer radius and preserves ambiguous zero padding', () => {
  assert.deepEqual(nextValues(DEFAULT_VALUES,'inner',12), {outer:40, inner:12, padding:28, size:300});
  assert.deepEqual(nextValues(DEFAULT_VALUES,'inner',48), {outer:40, inner:40, padding:0, size:300});
  const square = nextValues(DEFAULT_VALUES, 'padding', 100);
  assert.equal(nextValues(square,'inner',0), square);
  assert.deepEqual(nextValues(square,'inner',4), {outer:40, inner:4, padding:36, size:300});
});

test('updates clamp input, keep sizing values at whole pixels and reject non-finite values', () => {
  for (const name of Object.keys(LIMITS)) {
    for (let value=-30;value<420;value+=0.7) {
      const result=nextValues(DEFAULT_VALUES,name,value);
      for (const [key,[min,max]] of Object.entries(LIMITS)) {
        assert.ok(result[key]>=min && result[key]<=max);
        assert.equal(result[key]%1,0);
        if (key === 'outer') assert.equal(result[key]%4,0);
      }
      assert.equal(result.inner,innerRadius(result.outer,result.padding));
    }
    for (const value of [NaN,Infinity,-Infinity,undefined]) assert.equal(nextValues(DEFAULT_VALUES,name,value), DEFAULT_VALUES);
  }
  assert.equal(nextValues(DEFAULT_VALUES,'unexpected',30),DEFAULT_VALUES);
  assert.deepEqual(nextValues(DEFAULT_VALUES,'padding',21), {outer:40, inner:19, padding:21, size:300});
  assert.deepEqual(nextValues(DEFAULT_VALUES,'size',201), {outer:40, inner:20, padding:20, size:201});
  assert.deepEqual(nextValues(DEFAULT_VALUES,'inner',13), {outer:40, inner:12, padding:28, size:300});
});

test('preview preserves proportions and reserves space for readable redlines', () => {
  for (const width of [240,280,335,480,561,744]) {
    for (const size of [160,300,360]) {
      for (const padding of [0,20,100]) {
        const values={size,padding};
        const scale=previewScale(values,width,width,true,true);
        assert.ok(scale>0 && scale<=1);
        assert.ok((size+padding*2)*scale+136+48 <= width+1e-8);
        assert.ok((size+padding*2)*scale+72+48 <= width+1e-8);
      }
    }
  }
  assert.equal(previewScale({size:360,padding:100},744,744,true,true),1);
  assert.equal(previewScale(DEFAULT_VALUES,480,480,true,false),1);
});

test('expansion responds to total footprint and annotation visibility', () => {
  assert.equal(needsExpandedPreview(DEFAULT_VALUES,true),false);
  assert.equal(needsExpandedPreview({...DEFAULT_VALUES,size:360},true),true);
  assert.equal(needsExpandedPreview({...DEFAULT_VALUES,size:360},false),false);
  assert.equal(needsExpandedPreview({...DEFAULT_VALUES,size:360,padding:100},false),true);
});
