import { sounds } from './sound'
import type { SessionAudioEvent } from './gameSession'

export function playSessionAudio(event: SessionAudioEvent) {
  switch (event.name) {
    case 'blaster': sounds.blaster(...event.args); break
    case 'stopThrust': sounds.stopThrust(...event.args); break
    case 'stopPhaser': sounds.stopPhaser(...event.args); break
    case 'stopRadiation': sounds.stopRadiation(...event.args); break
    case 'teleport': sounds.teleport(...event.args); break
    case 'collect': sounds.collect(...event.args); break
    case 'init': sounds.init(...event.args); break
    case 'stopStoreMusic': sounds.stopStoreMusic(...event.args); break
    case 'havenRecovery': sounds.havenRecovery(...event.args); break
    case 'explosion': sounds.explosion(...event.args); break
    case 'shieldHit': sounds.shieldHit(...event.args); break
    case 'radiationTick': sounds.radiationTick(...event.args); break
    case 'botCue': sounds.botCue(...event.args); break
    case 'shieldCharge': sounds.shieldCharge(...event.args); break
    case 'startPhaser': sounds.startPhaser(...event.args); break
    case 'startRepairHum': sounds.startRepairHum(...event.args); break
    case 'stopRepairHum': sounds.stopRepairHum(...event.args); break
    case 'havenImpact': sounds.havenImpact(...event.args); break
  }
}
