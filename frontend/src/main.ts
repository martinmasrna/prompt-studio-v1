import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import 'katex/dist/katex.min.css';
import { initRouter } from './store/router';

initRouter();
createApp(App).mount('#app');
