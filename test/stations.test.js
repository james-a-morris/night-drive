import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrive, advanceDrive, CRUISING_SPEED } from '../src/drive.ts';
import { FIRST_STATION, stationAt, stationAvailable, STATION_DWELL_SECONDS } from '../src/station-route.ts';
import { routeRegions, ROUTE_LENGTH } from '../src/environments.ts';
import { playDepartureChime } from '../src/departure-chime.ts';
import { stationClockHands } from '../src/station-clock.ts';

test('station clocks use local hours and minutes, including noon and midnight', () => {
  const date = new Date(2026, 8, 24, 15, 30);
  assert.deepEqual(stationClockHands(date), { minute: Math.PI, hour: 3.5 / 12 * Math.PI * 2 });
  date.setHours(0, 0); assert.deepEqual(stationClockHands(date), { minute: 0, hour: 0 });
  date.setHours(12, 0); assert.deepEqual(stationClockHands(date), { minute: 0, hour: 0 });
  date.setHours(23, 59);
  assert.ok(stationClockHands(date).hour < Math.PI * 2);
  assert.equal(stationClockHands(date).minute, 59 / 60 * Math.PI * 2);
});

test('the journey boards at Willow Halt, waits, and departs once', () => {
  const drive = createDrive();
  assert.equal(drive.progress, FIRST_STATION);
  assert.equal(drive.station.name, 'Willow Halt');
  advanceDrive(drive, 30); assert.equal(drive.progress, FIRST_STATION);
  drive.started = true;
  advanceDrive(drive, 5); assert.equal(drive.distance, 0); assert.equal(drive.speed, 0);
  for (let i=0;i<120;i++)advanceDrive(drive,1/60);
  assert.equal(drive.departures, 1); assert.ok(drive.progress>FIRST_STATION);
  assert.ok(drive.speed>0&&drive.speed<15, 'the train pulls away gently');
});

test('arrivals brake smoothly, stop precisely, accrue no parked mileage and resume', () => {
  const stop=stationAt(1), drive={...createDrive(),started:true,progress:stop.at-230,speed:CRUISING_SPEED,station:null,dwellRemaining:0,lastStation:0};
  let previous=drive.speed;
  for(let i=0;i<60*90&&drive.dwellRemaining===0;i++){
    const before=drive.distance, moved=advanceDrive(drive,1/60);
    assert.ok(Math.abs(drive.distance-before-moved)<1e-8);
    assert.ok(drive.speed<=previous+.001); previous=drive.speed;
  }
  assert.equal(drive.progress,stop.at);assert.equal(drive.speed,0);assert.equal(drive.dwellRemaining,STATION_DWELL_SECONDS);
  const distance=drive.distance;
  for(let i=0;i<60*20;i++)advanceDrive(drive,1/60);
  assert.equal(drive.distance,distance);assert.equal(drive.progress,stop.at);
  for(let i=0;i<60*4;i++)advanceDrive(drive,1/60);
  assert.ok(drive.progress>stop.at);assert.equal(drive.departures,1);assert.equal(drive.lastStation,stop.index);
});

test('stations follow their own sparse timetable and avoid tunnels, bridges and route boundaries', () => {
  let previous=0, awayFromBoundaries=0;
  for(let index=0;index<40;index++){
    const stop=stationAt(index);if(!stop)continue;
    assert.ok(stop.at>previous);if(index>0)assert.ok(stop.at-previous>1500);previous=stop.at;
    assert.ok(stationAvailable(stop.at,'auto'));
    assert.equal(stationAvailable(stop.at,'bridge'),false);
    assert.equal(stationAvailable(stop.at,'tunnel'),false);
    if(routeRegions.every(region=>Math.abs(stop.at%ROUTE_LENGTH-region.start)>100))awayFromBoundaries++;
  }
  assert.ok(awayFromBoundaries>25, 'stops are not triggered by biome transitions');
});

test('changing scenery during a stop never traps the train or emits a false departure ding', () => {
  const drive={...createDrive(),started:true};advanceDrive(drive,.05,'bridge');
  assert.equal(drive.station,null);assert.equal(drive.dwellRemaining,0);assert.ok(drive.speed>0);assert.equal(drive.departures,0);
});

test('departure bell schedules two gentle notes and releases every voice', () => {
  const nodes=[], voices=new Set();
  const gain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this},disconnect(){this.disconnected=true}});
  const audio={state:'running',currentTime:10,createGain:gain,createOscillator(){const node={frequency:{value:0},connect(){return this},disconnect(){this.disconnected=true},start(at){this.at=at},stop(at){this.end=at}};nodes.push(node);return node}};
  playDepartureChime(audio,{},voices);assert.equal(voices.size,4);
  assert.ok(nodes[2].at>nodes[0].at);assert.equal(nodes[0].frequency.value,880);assert.equal(nodes[2].frequency.value,659.25);
  for(const node of nodes){assert.ok(node.end-node.at<1.5);node.onended();assert.ok(node.disconnected)}
  assert.equal(voices.size,0);audio.state='suspended';playDepartureChime(audio,{},voices);assert.equal(voices.size,0);
});
