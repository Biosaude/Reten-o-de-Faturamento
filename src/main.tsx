import { CorporatePreviewGate } from "./CorporatePreviewGate";
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode>{(["preview", "production"].includes(import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT) || import.meta.env.VITE_RETENTION_CORPORATE_PREVIEW === "true") ? <CorporatePreviewGate><App/></CorporatePreviewGate> : <App/>}</StrictMode>);
