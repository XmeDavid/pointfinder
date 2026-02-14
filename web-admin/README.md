# PointFinder Web Admin

React + TypeScript web admin panel for the PointFinder NFC gaming platform.

## Stack

- React 19 with TypeScript
- Vite build system
- Tailwind CSS v4
- Zustand for auth state
- TanStack React Query for data fetching
- Leaflet for interactive maps
- i18next for multi-language support (EN/PT/DE)

## Development

```bash
npm install
npm run dev
```

## Testing

```bash
npm run test          # single run
npm run test:watch    # watch mode
```

## Linting

```bash
npm run lint
```

## Building

```bash
npm run build
```

The production build is output to `dist/` and served by the nginx container in the Docker Compose stack.
