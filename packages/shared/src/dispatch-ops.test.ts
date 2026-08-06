import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessDispatchCommunicationReadiness,
  compareJobsForDispatcherBoard,
  dominantDispatcherStatus,
  isDispatcherEmergencyPriority,
  mapDualTrackToDispatcherStatus,
  mapWorkflowActionToCommunicationHook,
  resolveCustomerEtaReadiness,
  formatDispatcherStatusLabel,
  selectDispatcherEmergencyJobs,
} from './dispatch-ops.js';

test('mapDualTrackToDispatcherStatus follows Scheduled → En route → Arrived → In progress → Completed', () => {
  assert.equal(
    mapDualTrackToDispatcherStatus({ status: 'scheduled', executionPhase: 'assigned' }),
    'scheduled',
  );
  assert.equal(
    mapDualTrackToDispatcherStatus({ status: 'scheduled', executionPhase: 'en_route' }),
    'en_route',
  );
  assert.equal(
    mapDualTrackToDispatcherStatus({ status: 'in_progress', executionPhase: 'on_site' }),
    'arrived',
  );
  assert.equal(
    mapDualTrackToDispatcherStatus({ status: 'in_progress', executionPhase: 'in_progress' }),
    'in_progress',
  );
  assert.equal(
    mapDualTrackToDispatcherStatus({ status: 'completed', executionPhase: 'completed' }),
    'completed',
  );
  assert.equal(formatDispatcherStatusLabel('en_route'), 'En route');
  assert.equal(formatDispatcherStatusLabel('arrived'), 'Arrived');
});

test('resolveCustomerEtaReadiness never invents live ETA without Maps + coords', () => {
  const scheduleOnly = resolveCustomerEtaReadiness({
    status: 'scheduled',
    assignedUserId: 'tech-1',
    scheduledAt: '2026-08-03T10:00:00.000Z',
    scheduledEndAt: null,
    jobHasVerifiedCoordinates: true,
    mapsCapability: 'not_configured',
    cartrackPositionAvailable: false,
  });
  assert.equal(scheduleOnly.state, 'maps_not_connected');
  assert.equal(scheduleOnly.etaAt, '2026-08-03T10:00:00.000Z');
  assert.equal(scheduleOnly.travelMinutes, null);

  const gpsNoMaps = resolveCustomerEtaReadiness({
    status: 'scheduled',
    assignedUserId: 'tech-1',
    scheduledAt: '2026-08-03T10:00:00.000Z',
    scheduledEndAt: null,
    jobHasVerifiedCoordinates: true,
    mapsCapability: 'not_configured',
    cartrackPositionAvailable: true,
  });
  assert.equal(gpsNoMaps.state, 'technician_location_available');
  assert.match(gpsNoMaps.warning ?? '', /Google Maps/);

  const liveReady = resolveCustomerEtaReadiness({
    status: 'scheduled',
    assignedUserId: 'tech-1',
    scheduledAt: '2026-08-03T10:00:00.000Z',
    scheduledEndAt: null,
    jobHasVerifiedCoordinates: true,
    mapsCapability: 'connected',
    cartrackPositionAvailable: true,
    travelMinutes: 18,
    travelSource: 'google_maps',
  });
  assert.equal(liveReady.state, 'live_routing_ready');
  assert.equal(liveReady.travelMinutes, 18);
});

test('assessDispatchCommunicationReadiness stays draft/approve gated', () => {
  const ready = assessDispatchCommunicationReadiness({
    hookType: 'technician_en_route',
    customerName: 'Acme',
    jobTitle: 'Boiler service',
    technicianName: 'Alex',
    scheduledAt: '2026-08-03T10:00:00.000Z',
    etaLabel: 'Planned arrival 10:00',
    recipientAddress: '+27821234567',
    activeChannels: ['whatsapp', 'email'],
  });
  assert.equal(ready.state, 'ready_to_queue');
  assert.equal(ready.requiresApproval, true);
  assert.equal(ready.preferredChannel, 'whatsapp');
  assert.match(ready.draftMessageBody ?? '', /en route/);

  const noChannel = assessDispatchCommunicationReadiness({
    hookType: 'job_completed',
    customerName: 'Acme',
    jobTitle: 'Boiler service',
    technicianName: null,
    scheduledAt: null,
    etaLabel: null,
    recipientAddress: 'a@example.com',
    activeChannels: [],
  });
  assert.equal(noChannel.state, 'channel_unavailable');
});

test('workflow action hooks map en_route and complete only', () => {
  assert.equal(mapWorkflowActionToCommunicationHook('en_route'), 'technician_en_route');
  assert.equal(mapWorkflowActionToCommunicationHook('complete'), 'job_completed');
  assert.equal(mapWorkflowActionToCommunicationHook('arrive'), null);
});

test('dominantDispatcherStatus prefers active field work over scheduled', () => {
  assert.equal(dominantDispatcherStatus(['scheduled', 'en_route', 'completed']), 'en_route');
  assert.equal(dominantDispatcherStatus(['completed', 'completed']), null);
});

test('dispatcher emergency prioritisation uses stored urgent/high only', () => {
  assert.equal(isDispatcherEmergencyPriority('urgent'), true);
  assert.equal(isDispatcherEmergencyPriority('high'), true);
  assert.equal(isDispatcherEmergencyPriority('normal'), false);

  const sorted = [
    { title: 'Normal A', priority: 'normal', scheduledAt: '2026-08-03T09:00:00.000Z', status: 'scheduled' },
    { title: 'Urgent B', priority: 'urgent', scheduledAt: '2026-08-03T11:00:00.000Z', status: 'scheduled' },
    { title: 'High C', priority: 'high', scheduledAt: '2026-08-03T08:00:00.000Z', status: 'in_progress' },
    { title: 'Done Urgent', priority: 'urgent', scheduledAt: '2026-08-03T07:00:00.000Z', status: 'completed' },
  ].sort(compareJobsForDispatcherBoard);

  assert.deepEqual(
    sorted.map((j) => j.title),
    ['Urgent B', 'High C', 'Normal A', 'Done Urgent'],
  );

  const emergencies = selectDispatcherEmergencyJobs(sorted);
  assert.deepEqual(
    emergencies.map((j) => j.title),
    ['Urgent B', 'High C'],
  );
});
