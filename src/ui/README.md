# UI structure

- `App.tsx` connects the screens, shared state, and desktop actions.
- `components/screens/` contains one component for each swipeable screen.
- `components/gauges/` contains the dial and history graph components.
- `components/` contains shared overlays such as the toast and power confirmation.
- `hooks/` contains system metric polling, screen swipe navigation, and button feedback.
- `data/` contains preview readings and the launcher app list.
- `types.ts` contains shared UI and metric types.
- `styles.css` imports the CSS entry points in `styles/`; each file groups a UI area or global theme.
