import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {HashRouter,Routes,Route} from 'react-router-dom';
import {Shell} from '../src/App';
import Clients from '../src/Clients';
import {AuthContext} from '@web/context/AuthContext';
import {DataContext} from '@web/context/DataContext';
import {SettingsContext} from '@web/context/SettingsContext';
import {DEFAULT_SETTINGS} from '@web/config/settings';
import {buildClientRows} from '@web/lib/loan';
import '@web/index.css';
import '../src/mobile.css';
const clients = Array.from({length:6},(_,i)=>({id:'c'+i,firstName:'Borrower with a long first name',lastName:'Long family name',middleName:'',address:'Test',cellphone:'',principal:1000,interest:100,loanTermDays:45 as const,approvalDate:'2026-11-01',dailyAmount:25,transactionNumber:'0000'+i}));
function Fixture(){
 const [admin,setAdmin]=useState(false);
 return <AuthContext.Provider value={{status:'signedIn',user:{uid:'test'} as any,profile:{uid:'test',fullName:'Collector with a long full name',role:admin?'admin':'collector',active:true} as any,accessError:null,signIn:async()=>{},signOut:async()=>{}}}>
 <SettingsContext.Provider value={{settings:DEFAULT_SETTINGS,loading:false,error:null}}>
 <DataContext.Provider value={{clients,payments:[],collectors:[],holidays:[],rows:buildClientRows(clients,[],new Set(),'2026-11-02'),today:'2026-11-02',loading:false,error:null}}>
 <button onClick={()=>setAdmin(!admin)}>Switch role</button>
 <HashRouter><Routes><Route element={<Shell/>}><Route path="*" element={<Clients/>}/></Route></Routes></HashRouter>
 </DataContext.Provider></SettingsContext.Provider></AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
