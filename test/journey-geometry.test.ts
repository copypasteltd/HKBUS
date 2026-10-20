import {test} from 'node:test';
import assert from 'node:assert/strict';
import {journeyGeometry} from '../src/journey-geometry.js';
import type {OrderedStop} from '../src/journey-planner.js';
const stop=(sequence:number,longitude:number,latitude=22.3)=>({id:String(sequence),sequence,longitude,latitude,name:{tc:'',sc:'',en:''},source:'live',active:true}) as OrderedStop;
test('selected official segment excludes the rest of the route without joining missing pieces',()=>{
 const geometry={type:'MultiLineString' as const,coordinates:[[[114.1,22.3],[114.11,22.3],[114.12,22.3]],[[114.13,22.3],[114.14,22.3],[114.15,22.3]]]};
 const stops=[.1,.11,.12,.13,.14,.15].map((value,index)=>stop(index+1,114+value));
 const clipped=journeyGeometry(geometry,stops,2,5)!;assert.equal(clipped.coordinates.length,2);assert.deepEqual(clipped.coordinates[0]![0],[114.11,22.3]);assert.deepEqual(clipped.coordinates[1]!.at(-1),[114.14,22.3]);assert.equal(clipped.coordinates.flat().some(x=>x[0]===114.1||x[0]===114.15),false);
});
test('ordered repeated locations select the later lap instead of an earlier nearest edge',()=>{
 const geometry={type:'MultiLineString' as const,coordinates:[[[114.1,22.3],[114.11,22.3],[114.11,22.31],[114.1,22.31],[114.1,22.3],[114.12,22.3]]]};
 const stops=[stop(1,114.1),stop(2,114.11),stop(3,114.11,22.31),stop(4,114.1,22.31),stop(5,114.1),stop(6,114.12)];
 assert.deepEqual(journeyGeometry(geometry,stops,5,6)?.coordinates,[[[114.1,22.3],[114.12,22.3]]]);
});
test('missing, unaligned, backwards or unmatched anchors do not fabricate a selected path',()=>{
 const geometry={type:'MultiLineString' as const,coordinates:[[[114.1,22.3],[114.12,22.3]]]};
 assert.equal(journeyGeometry(null,[stop(1,114.1),stop(2,114.12)],1,2),null);
 assert.equal(journeyGeometry(geometry,[stop(1,114.1),stop(2,114.5)],1,2),null);
 assert.equal(journeyGeometry(geometry,[stop(1,114.12),stop(2,114.1)],1,2),null);
 assert.equal(journeyGeometry(geometry,[stop(1,114.1),stop(2,114.12)],2,1),null);
});
