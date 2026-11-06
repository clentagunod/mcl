package com.mcl.mcllendingapp.presentation.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import com.mcl.mcllendingapp.ui.theme.AppSpacing

@Composable
fun PageControls(page:Int,pageSize:Int,total:Int,onPage:(Int)->Unit,onSize:((Int)->Unit)?=null,
    sizes:List<Int> = listOf(10,25,50,100)){
    val pageCount=maxOf(1,(total+pageSize-1)/pageSize)
    var sizeMenu by remember{mutableStateOf(false)}
    var jump by rememberSaveable{mutableStateOf(false)}
    var number by rememberSaveable{mutableStateOf("")}
    Column(verticalArrangement=Arrangement.spacedBy(AppSpacing.extraSmall)){
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
            Text(if(total==0)"0 records" else "${page*pageSize+1}–${minOf((page+1)*pageSize,total)} of $total",
                Modifier.weight(1f),style=MaterialTheme.typography.labelMedium)
            if(onSize!=null)Box{
                TextButton(onClick={sizeMenu=true}){Text("$pageSize per page")}
                DropdownMenu(sizeMenu,{sizeMenu=false}){
                    sizes.forEach{size->DropdownMenuItem(text={Text("$size per page")},
                        onClick={sizeMenu=false;onSize(size)})}
                }
            }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(AppSpacing.extraSmall)){
            IconButton(onClick={onPage(0)},enabled=page>0,modifier=Modifier.semantics{contentDescription="First page"}){Text("«")}
            TextButton(onClick={onPage(page-1)},enabled=page>0){Text("Prev")}
            TextButton(onClick={number=(page+1).toString();jump=true},
                modifier=Modifier.semantics{contentDescription="Go to page ${page+1} of $pageCount"}){Text("${page+1} / $pageCount")}
            TextButton(onClick={onPage(page+1)},enabled=(page+1)*pageSize<total){Text("Next")}
            IconButton(onClick={onPage(pageCount-1)},enabled=(page+1)*pageSize<total,
                modifier=Modifier.semantics{contentDescription="Last page"}){Text("»")}
        }
    }
    if(jump){
        val target=number.toIntOrNull()
        val valid=target!=null&&target in 1..pageCount
        AlertDialog(onDismissRequest={jump=false},title={Text("Go to page")},
            text={OutlinedTextField(number,{number=it},label={Text("Page number")},singleLine=true,
                isError=!valid,supportingText={Text("Choose a page from 1 to $pageCount.")},
                keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number))},
            confirmButton={TextButton(onClick={target?.let{onPage(it-1)};jump=false},enabled=valid){Text("Go")}},
            dismissButton={TextButton(onClick={jump=false}){Text("Cancel")}})
    }
}
