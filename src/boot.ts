// Entry point. In the iOS app, saved data is copied back from native storage before main.ts reads
// its settings; in a browser restoreStorage() returns at once.
import { restoreStorage } from './native';

void restoreStorage().then(() => import('./main'));
