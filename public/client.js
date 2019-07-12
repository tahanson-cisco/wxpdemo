const offset = new Date().getTimezoneOffset();
var today = new Date();
var time = today.getHours() + ":" + today.getMinutes();
let picked_date;
console.log(`time is ${time}`);

flatpickr("#flatpckr", {
  enableTime: true,
  dateFormat: "Y-m-d H:i",
  minDate: "today",
  minTime: time,
  defaultTime: time,
  onChange: function(selectedDates, dateStr, instance) {
    console.log(`selection changed ${dateStr} `);
    picked_date = dateStr;
    document.getElementById('selected_expiry').innerHTML = picked_date;
  },
  allowInput: true,
  //time_24hr: true
});


let create_button = document.getElementById('create_button');
create_button.onclick = function (event){
  //event.preventDefault();
  try {
    create_message_object()
    //.then((message) => validate_message_object(message))
    .then((result) => {
      console.log (result)
      if (result){
        post_data();
      } else {

      }
    });
  } 
  catch (err){
    console.log(err);
  }

}
let message = {};
async function create_message_object(){
  //let message = {};
  message.display_name = document.getElementById('displayname').value;
  message.expiry_date = picked_date;
  message.sip_target = document.getElementById('sipuri').value;
  message.offset = offset;
  //message.send_email = document.getElementById('email').value;
  //message.send_sms = document.getElementById('sms').value;
  return message;
};

async function validate_message_object(message){
  if(!message.expiry_date || !message.sip_target){
    //console.log(`Bad data`);
    showMessage(`{"error":"Oops, you seem to be missing something.."}`);
    return false;
  } else {
    console.log (JSON.stringify(message));
    document.getElementById('selected_expiry').innerHTML = message.expiry_date;
    return true;
  }
};

async function post_data(){
  fetch('/create_url', { 
    method: 'POST', 
    credentials: 'same-origin',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(message),
  })
  .then(handleResponse)
  .then(showMessage)
  .catch(function(err) {
    showMessage(err.message);
  });
};

function showMessage(message) {
  //messages.textContent += `\n${message}`;
  messages.textContent = `\n${message}`;
  messages.scrollTop = messages.scrollHeight;
  console.log(JSON.parse(message));
  if((JSON.parse(message)).url){
    console.log(`URL found - ${(JSON.parse(message)).url}`)
    document.getElementById('send_as_email_section').style.display = 'block';
    document.getElementById('guest_info_section').style.display = 'none';
  };
}

function handleResponse(response) {
  return response.ok
    ? response.json().then((data) => JSON.stringify(data, null, 2))
    : Promise.reject(new Error('Unexpected response'));
}


console.log(`timezone offset = ${offset}`);


//EMail Modal stuff --

// Get the modal
var modal = document.getElementById("myEmailModal");

// Get the button that opens the modal
var btn = document.getElementById("send_as_email_button");

// Get the <span> element that closes the modal
var span = document.getElementsByClassName("closeEmailModal")[0];

// When the user clicks the button, open the modal 
btn.onclick = function() {
  modal.style.display = "block";
}

// When the user clicks on <span> (x), close the modal
span.onclick = function() {
  modal.style.display = "none";
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = "none";
  }
}