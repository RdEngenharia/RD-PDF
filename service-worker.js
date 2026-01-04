
const CACHE_NAME = 'rd-pdf-cache-v2'; // Bump version to force update
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/index.css',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/manifest.json',
  '/components/PdfMerger.tsx',
  '/components/ImageToPdf.tsx',
  '/components/PdfCompressor.tsx',
  '/components/PdfSplitter.tsx',
  '/components/PdfEditor.tsx',
  '/components/ImageAnnotator.tsx',
  '/components/Icons.tsx',
  '/images/icon-192.png',
  '/images/icon-512.png'
  // Os assets de node_modules serão gerenciados pelo build do Vite.
  // Para uma estratégia de cache mais robusta em produção,
  // um plugin como o vite-plugin-pwa é recomendado para gerar o service worker automaticamente.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Usar `cache.addAll` pode falhar se um único arquivo não for encontrado.
        // Em um cenário real, é melhor adicionar arquivos essenciais um por um.
        return Promise.all(
          FILES_TO_CACHE.map(url => cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err)))
        );
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições que não são GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Se não estiver no cache, busca na rede
        return fetch(event.request).then(
          (networkResponse) => {
            // Não armazenamos em cache respostas de erro ou opacas
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            return networkResponse;
          }
        );
      }
    )
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
