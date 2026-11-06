package com.mcl.mcllendingapp.presentation.components

import androidx.compose.material3.*
import androidx.compose.runtime.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(label:String,value:String,onChange:(String)->Unit,error:String?=null,enabled:Boolean=true) {
    var show by remember { mutableStateOf(false) }
    FormField(label,value,onChange,error,enabled=enabled)
    TextButton(onClick={show=true},enabled=enabled){Text("Choose date")}
    if(show) {
        val picker=rememberDatePickerState(initialSelectedDateMillis=runCatching{LocalDate.parse(value).toEpochDay()*86_400_000L}.getOrNull())
        DatePickerDialog(onDismissRequest={show=false},confirmButton={TextButton(onClick={
            picker.selectedDateMillis?.let{onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString())};show=false
        }){Text("Choose")}},dismissButton={TextButton(onClick={show=false}){Text("Cancel")}}){DatePicker(picker)}
    }
}
