<template>
  <main class="not-found">
    <p class="not-found-code">404</p>
    <h1>This page isn’t here.</h1>
    <p>Head back to the training log and pick up where you left off.</p>
    <RouterLink to="/" class="home-link"
      >Back to the home page <span aria-hidden="true">↗</span></RouterLink
    >
  </main>
</template>

<style scoped>
.not-found {
  display: grid;
  min-height: 100dvh;
  align-content: center;
  justify-items: start;
  padding: clamp(2rem, 10vw, 9rem);
  background: var(--bg-page, #0b0e14);
  color: var(--text-primary, #f1f5f9);
}
.not-found-code {
  margin: 0 0 1rem;
  color: var(--accent-lime, #a3e635);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(4rem, 13vw, 9rem);
  font-weight: 700;
  line-height: 0.8;
}
.not-found h1 {
  max-width: 10ch;
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(2.5rem, 6vw, 5rem);
  line-height: 0.95;
}
.not-found > p:not(.not-found-code) {
  max-width: 34ch;
  color: var(--text-secondary, #94a3b8);
  line-height: 1.7;
}
.home-link {
  margin-top: 1rem;
  padding: 0.9rem 1.4rem;
  background: var(--accent-lime, #a3e635);
  color: #0b0e14;
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-radius: 6px;
  text-decoration: none;
  transition: opacity 0.2s ease;
}
.home-link:hover {
  opacity: 0.9;
}
.home-link span {
  margin-left: 0.5rem;
}
.home-link:focus-visible {
  outline: 2px solid var(--accent-lime, #a3e635);
  outline-offset: 4px;
}
</style>
