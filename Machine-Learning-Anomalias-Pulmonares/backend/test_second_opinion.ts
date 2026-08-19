import { getSecondOpinion } from './src/services/secondOpinionService.js';
import { env } from './src/config/env.js';
console.log('API Key loaded:', env.GEMINI_API_KEY ? 'Yes' : 'No');
async function test() {
    try {
        const report = await getSecondOpinion('sample_normal.jpg');
        console.log('Report:', report);
    } catch (e) {
        console.error('Test error:', e);
    }
}
test();
