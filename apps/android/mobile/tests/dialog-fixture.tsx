import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {Modal} from '@web/components/Modal';
import '@web/index.css';
import '../src/mobile.css';
function App(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Add payment</button>{open&&<Modal title="Add payment" onClose={()=>setOpen(false)}><h3>Test borrower</h3><form><label>Amount<input defaultValue="250"/></label><label>Date<input type="date"/></label><label>Notes<textarea/></label><p>Payment details and policy.</p><button>Save payment</button></form></Modal>}</>}
createRoot(document.getElementById('root')!).render(<App/>);
