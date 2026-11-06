package com.mcl.mcllendingapp.presentation.navigation

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.*
import androidx.navigation.toRoute
import com.mcl.mcllendingapp.presentation.clients.*
import com.mcl.mcllendingapp.presentation.collectors.CollectorsScreen
import com.mcl.mcllendingapp.presentation.components.MclIcon
import com.mcl.mcllendingapp.presentation.consolidation.ConsolidationScreen
import com.mcl.mcllendingapp.presentation.dashboard.DashboardScreen
import com.mcl.mcllendingapp.presentation.holidays.HolidaysScreen
import com.mcl.mcllendingapp.presentation.login.LoginScreen
import com.mcl.mcllendingapp.presentation.payments.PaymentsScreen
import com.mcl.mcllendingapp.presentation.printables.PrintablesScreen
import com.mcl.mcllendingapp.presentation.renewal.*
import com.mcl.mcllendingapp.presentation.settings.SettingsScreen
import com.mcl.mcllendingapp.presentation.trash.TrashScreen
import com.mcl.mcllendingapp.ui.theme.*
import com.mcl.mcllendingapp.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(window:WindowSizeClass,viewModel:RootViewModel=hiltViewModel()){
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var themePicker by remember{mutableStateOf(false)}
    val dark=when(state.theme){"dark"->true;"light"->false;else->isSystemInDarkTheme()}
    MCLLendingAppTheme(darkTheme=dark){
        Surface(Modifier.fillMaxSize()){
            if(themePicker)AlertDialog(onDismissRequest={themePicker=false},title={Text("Appearance")},text={
                Column{listOf("system","light","dark").forEach{mode->TextButton(onClick={viewModel.onEvent(RootEvent.Theme(mode));themePicker=false}){
                    Text(mode.replaceFirstChar(Char::uppercase))}}}
            },confirmButton={TextButton(onClick={themePicker=false}){Text("Close")}})
            val session=state.session
            when{
                session.loading->Column(Modifier.fillMaxSize().padding(AppSpacing.large),verticalArrangement=Arrangement.Center){
                    CircularProgressIndicator();Text("Verifying account access…")
                    TextButton(onClick={viewModel.onEvent(RootEvent.SignOut)}){Text("Return to sign in")}}
                !session.authorized->LoginScreen(session.error,onTheme={themePicker=true})
                else->key(session.account?.uid,session.isAdmin){
                    val context=LocalContext.current
                    var legacyReady by remember{mutableStateOf(false)}
                    var legacyError by remember{mutableStateOf<String?>(null)}
                    var attempt by remember{mutableIntStateOf(0)}
                    LaunchedEffect(session.account?.uid,attempt){
                        runCatching{LegacyReceiptReader().read(context,session.account!!.uid)}
                            .onSuccess{values->viewModel.onEvent(RootEvent.LegacyReceipts(values));legacyReady=true}
                            .onFailure{legacyError="Reserved receipts could not be checked: ${it.message}"}
                    }
                    if(!legacyReady||!state.legacyComplete)Column(Modifier.fillMaxSize().padding(AppSpacing.large),verticalArrangement=Arrangement.Center){
                        if(legacyError==null&&state.error==null){CircularProgressIndicator();Text("Checking reserved receipts…")}
                        else{Text(legacyError?:state.error.orEmpty(),color=MaterialTheme.colorScheme.error);Button(onClick={legacyError=null;attempt++}){Text("Retry receipt recovery")}}
                        TextButton(onClick={viewModel.onEvent(RootEvent.SignOut)}){Text("Return to sign in")}
                    }else WorkspaceNavigation(state,window.widthSizeClass!=WindowWidthSizeClass.Compact,
                        onTheme={themePicker=true},onRefresh={viewModel.onEvent(RootEvent.Refresh)},onSignOut={viewModel.onEvent(RootEvent.SignOut)})
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkspaceNavigation(state:RootUiState,expanded:Boolean,onTheme:()->Unit,onRefresh:()->Unit,onSignOut:()->Unit){
    val nav=rememberNavController()
    val current by nav.currentBackStackEntryAsState()
    val admin=state.session.isAdmin
    val items=if(admin)listOf(Triple("Dashboard","dashboard",DashboardRoute),Triple("Clients","clients",ClientsRoute),
        Triple("Printables","documents",PrintablesRoute()),Triple("Ledger","wallet",LedgerRoute),Triple("More","more",MoreRoute))
        else listOf(Triple("Collections","clients",ClientsRoute),Triple("More","more",MoreRoute))
    fun navigateTop(route:Any){
        nav.navigate(route){launchSingleTop=true;restoreState=true
            popUpTo(nav.graph.startDestinationId){saveState=true}}
    }
    fun selected(route:Any):Boolean{
        val destination=current?.destination?:return false
        return when(route){
            ClientsRoute->listOf(ClientsRoute::class,ClientRoute::class,ClientFormRoute::class,PaymentsRoute::class,
                RenewalRoute::class,RenewalHistoryRoute::class).any{destination.hasRoute(it)}
            MoreRoute->listOf(MoreRoute::class,AccountsRoute::class,HolidaysRoute::class,SettingsRoute::class,TrashRoute::class)
                .any{destination.hasRoute(it)}
            else->destination.hasRoute(route::class)
        }
    }
    Scaffold(
        topBar={TopAppBar(title={Text(state.businessName)},navigationIcon={
            if(nav.previousBackStackEntry!=null)IconButton(onClick={nav.popBackStack()}){MclIcon("back","Back")}
        },actions={
            IconButton(onClick=onRefresh){MclIcon("refresh","Refresh")}
            IconButton(onClick=onTheme){MclIcon("theme","Appearance")}
            if(!admin)TextButton(onClick=onSignOut){Text("Sign out")}
        })},
        bottomBar={if(!expanded)NavigationBar{items.forEach{(label,icon,route)->
            NavigationBarItem(selected=selected(route),onClick={navigateTop(route)},
                icon={MclIcon(icon,label)},label={Text(label)})}}}
    ){padding->
        Row(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding()){
            if(expanded)NavigationRail{items.forEach{(label,icon,route)->
                NavigationRailItem(selected=selected(route),onClick={navigateTop(route)},
                    icon={MclIcon(icon,label)},label={Text(label)})}}
            Column(Modifier.weight(1f)){
                if(state.sync.loading)LinearProgressIndicator(Modifier.fillMaxWidth())
                (state.error?:state.sync.error)?.let{Text(it,Modifier.padding(AppSpacing.small),color=MaterialTheme.colorScheme.error)}
                Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.TopCenter){
                    NavHost(navController=nav,startDestination=if(admin)DashboardRoute else ClientsRoute,
                        modifier=Modifier.widthIn(max=AppDimensions.contentMaxWidth).fillMaxSize()){
                        composable<ClientsRoute>{ClientsScreen({nav.navigate(ClientRoute(it))},{nav.navigate(ClientFormRoute())},{nav.navigate(TrashRoute)})}
                        composable<ClientRoute>{entry->
                            val id=entry.toRoute<ClientRoute>().clientId
                            val detail: @Composable () -> Unit = {ClientDetailScreen(
                                {nav.navigate(PaymentsRoute(id))},{nav.navigate(ClientFormRoute(id))},
                                {nav.navigate(PrintablesRoute(id))},{nav.navigate(RenewalRoute(id))},
                                {nav.navigate(RenewalHistoryRoute(id))},{nav.popBackStack()},viewModel=hiltViewModel(key="client-"+id))}
                            if(expanded)Row(Modifier.fillMaxSize()){
                                Box(Modifier.weight(1f)){ClientsScreen({nav.navigate(ClientRoute(it)){launchSingleTop=true}},
                                    {nav.navigate(ClientFormRoute())},{nav.navigate(TrashRoute)})}
                                Box(Modifier.weight(1f)){detail()}
                            }else detail()
                        }
                        composable<PaymentsRoute>{PaymentsScreen()}
                        composable<PrintablesRoute>{entry->PrintablesScreen(initialClientId=entry.toRoute<PrintablesRoute>().clientId.ifBlank{null},
                            onSettings={nav.navigate(SettingsRoute())},expanded=expanded,collectorMode=!admin)}
                        composable<MoreRoute>{MoreScreen({nav.navigate(AccountsRoute)},{nav.navigate(HolidaysRoute)},{nav.navigate(SettingsRoute())},{nav.navigate(TrashRoute)})}
                        if(admin){
                            composable<DashboardRoute>{DashboardScreen({navigateTop(ClientsRoute)},{nav.navigate(AccountsRoute)},{nav.navigate(ClientRoute(it))})}
                            composable<ClientFormRoute>{ClientFormScreen({nav.popBackStack()})}
                            composable<RenewalRoute>{entry->val id=entry.toRoute<RenewalRoute>().clientId
                                RenewalScreen({nav.popBackStack()},{nav.navigate(RenewalHistoryRoute(id))})}
                            composable<RenewalHistoryRoute>{entry->val id=entry.toRoute<RenewalHistoryRoute>().clientId
                                RenewalHistoryScreen({loan->nav.navigate(PaymentsRoute(id,loan))})}
                            composable<LedgerRoute>{ConsolidationScreen({nav.navigate(ClientRoute(it))})}
                            composable<AccountsRoute>{CollectorsScreen()}
                            composable<HolidaysRoute>{HolidaysScreen()}
                            composable<SettingsRoute>{entry->SettingsScreen(initialSection=entry.toRoute<SettingsRoute>().initialSection.ifBlank{null})}
                            composable<TrashRoute>{TrashScreen(onClients={navigateTop(ClientsRoute)},onRetention={nav.navigate(SettingsRoute("trash"))})}
                        }
                    }
                }
            }
        }
    }
}
