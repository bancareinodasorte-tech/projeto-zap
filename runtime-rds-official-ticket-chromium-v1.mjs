import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const marker='// RDS OFFICIAL TICKET CHROMIUM V1';
let server=fs.readFileSync('server.js','utf8');
if(server.includes(marker))process.exit(0);

const oldMarker='// RDS OFFICIAL TICKET AUTO DELIVERY V6';
const oldStart=server.indexOf(oldMarker);
if(oldStart<0)throw new Error('Runtime V6 dos bilhetes não localizado.');
const catchAllMarker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const oldEnd=server.indexOf(catchAllMarker,oldStart);
if(oldEnd<0)throw new Error('Catch-all não localizado para substituir o runtime V6.');
server=server.slice(0,oldStart)+server.slice(oldEnd);

const block=String.raw`
// RDS OFFICIAL TICKET CHROMIUM V1
(()=>{
  const {chromium}=require('playwright-core');
  const chromiumBinary=require('@sparticuz/chromium');
  const PDFDocument=require('pdfkit');
  const fs=require('node:fs');
  const RDS_Readable=require('node:stream').Readable;
  const QR=(()=>{try{return require('qrcode');}catch{return null;}})();

  // A tela oficial do APK usa /assets/logo.png. No servidor, usamos a cópia oficial enviada pela banca.
  // Logo oficial enviada pela banca, incorporada diretamente no renderizador para não depender de caminho externo.
  const logoB64="sjV1HQ9Jd5tA6aVF5MF9tJJfDztEAZe34UXU0dn+eFh85EZpQ1D6uwOd5wgrlGVMveJNS1xFASImxw6wofnOxOvzZVt7hv5D93xEWKQ3jc9EPSgd+L3xRwy5K/HsnixpAzaVeKz59EAuAsF6oB9CtTs5KFF8fulEG7wsNpkeSPc8DeBKIW0jkHW1OKrcBi2Gv7bEv4+r/En3JM2Dp54mpVKHfOlBbo81LHHYYz49UmRLZ+BL8hf2cV9WKxgCVoT7XlRviYD+uWcffPD9vH+6d51rc/xo8oDi9zYrl9xqAZVcPchYhkirbOA1lRgxxY+ibaf5IwZPUiKd5ELIIEXQyOZFEl+IGRdyg1DGUtK3Nu70H+9USiNvnF/UwSgGPWXwTwbjnj5c6QbjgOOL22ZbpNzCvSJ1J0mPV2i1SG7eqMaUXeqNZIRU+ATPSqITs11Bg8f+6atZ4Y/2ZHQ6eyIyPpCQX+Rm8VxcmPt+H1k/4EwAnQjeB/c1I14zRpcr4BRR3Y9+fzceP5/mNNUT+ilExL6ptX7tKNozsLITOG2xPKXwEY9jfNqKT8x+hTD29wh6zyfBlUhUwiwdz8vDvW1Mgw6Nb3ir+VlinWl1vS6KmZTu+GDEw5um7diJZ3T5WPLSp9w7CJSewvpOpIS0OYeinrz3QHQL7Msw+xeSq4rGPX7lPGRdLtdQOe+awTl/FoX8l2X68tqc9c6hoEPWntsUO2vHLr1kTDpHGMXhxOehGFzf/jTshmk2pyslqF9fDSvzTQNFCj4pZufE/s44LScHnxqzmQItgn4LTbpIS+YUshjrBRCnQ3mpgVDyQd931EJ8bbZz89rWOceV/brRQuxN4hJIQFPhZYiEYLscI+rek1HPKNBl4ezwMyVFhGCoeFnSi3KvBCEdq17+q5uCZr+xICKtECqHcJn6GomuoYqP5OeYdlpZO8/mzncqsA/TSj2PQFXu1cajAju7QS3FV+2JXewoeiqEvcLqr3S17FeCVTY+FIQscDDY3VmBM7QbWk3VKX1Ap6/rEoz9usBa6dj5bf90dJpWuw5NdeMNR98v5Ssm4v1aHYEgx5ZXG4DZXVc/lm8zBY4v2RlfxnZpTgC7d0lqPTc4UO0e6FbOinq+BKgp0rfYRZw5LdMDWGdBzHiKqh4q9frLbmhH85VpjJDTXoRZuaPnJInieXwN8ThMMz/rYvRIWFAVIzzzXMqMnIEgQ3ImhIGRKB1eJg+jftZmvaiy4VXqMc0K4AlLn2KnPIrfS3v9NNf0Fd//N25BE2PNjKIGEgEI7/8uS/o7CAOLkToDvXOr6/6kEfyXcK6xAnJSNT+o1cZLNu8MG+LqAooQ3W8i36Wls5LyQ0IEjUyIoJ8yAAAA1OA3pDKirIEuuPqH5bmzCjbfI+7WI1O/Wg5M6k9a0Z0H/pe3X5GQq1c5BZX9iVdYVHLvGSWQTNng74WeNCK5pMnKwlnNDnZSrwCR98JPLb6Mzr17KJV39ne15eT9iOPWQdH/sdAFR1jlvhZdW7Q2fIjeCO4rqNDbG9TZNRW+PZF2aE1s4nWoP9x12JIU1GBIRR8kfLzpEP78rfgVPovJ17E7YtwANqLSuakFKEEKzqxLF2Za6wGj3OKIcwfQj9bjonKd/o5J9oqT+NfcnAzbrxHMtNx4/ulOyHIqQrbZx+suTpoid0NlrN1BhmiMj7eMHkpWWieayLI9yD0OCifzL6kOJvqfRtTV9725kDN2DmXaPzwwlhoW/mUfVgYIIlzqA0ZW8DNSd9tx/IyP1aeLNUUQmZZpGHbFoHxrgtPu2f7yYJs23Pkl8su/PfSypsceQLiyC1vrC41ZN0v0DoJn8asdbUk/X1dWeta3hod7nRd7LoPH+9pBxUldFe2+3FEP8js8h/wv8rDKBo7nz+bWsi299BUnrWD+vJ+GuatdxpVCipN+g4ga4XlKzGDT7wjbnZFbPYaA5/h8Zhf3vArxf9RDN//0xYon9Q5A1HNrWJXsqxbUFrSu8/WDdSGwsk77FJ7NXDlL/xFWWpo6wuZZIEcUEohPSIfxf+QxU1oAFGE1mBxeiRBOuQEyd6hN8co7ViPzG6My/jfH6Tbs4IeBBAstfdqF63SnY7pcQncQRG9aA4V2TQCBsZHLqBLuXcnUTssXyJ837jAxBGzXIBoPq7uVKO2G89TRo7XIaiAGvvj8u59o0aBpjJW0NgGzSzPCD4Iud+c7pfGiXJYzShlwmJomSVimv1TFgsI+ytUJVkqPe6tC5oLMEk7irtOL+s3X2EF/aWjBGPtPcql4pkRABeobIbuJMRie/2KxrFK9TfWnBql8olV4cKGTAbMCancq9Cf0pkYrBTjinbFbbb9x72POiz013Ci7am+j4I0u0Tijd0Xe4HzKdOL8rnA81t8yTux6Me6mpE5qk0AHfLrD6N5oa91l3+jKBquwKJjQDC5aqyJnRKyD8sQWTBR3pAbrsca8Pf3LIPJbpwmG8K20sSA55tyXF4Kf3vJ8WE1XqvbN4reuL1rnWHXGeOHRvAZlZ+QrBaZhTXY9zgEzmC6dxDX7pQl3LuDDVh7HHoro2Xq5f+T5C2ZTNEQItj2J2mqpf8B7w3tQcSk9velZ/3KPODoG5GCwpVjmmUzTW7uLZDHfgQtzkVd8e235B/ZTkOBTrc81t8Egq83DS8JfJWNIKo+fErgpbcF1qdOyL2JkAbTJ41LxIjtfq4Adk6Oil4m4liT0LCXw+La/cpWUUS2iImWHkTO41Up9G3p8KeOROjsIF1fwoe9C7XulPlY/ZbpqCojRFkmqBpmboY0T8jhIf0Q3CDY/6PiCppqcgTqyfk4V1P8U1j5fUAxUkTzPpEIGau8hy5HvPfgZ7tdPCjF4B0ug6DvUGp3UCbzwWtzDFY3mc5ZblGA4l0jJS2PYcQ4FQ8Q5jK2PphCEG7RAkRGZTxVMHTO5X5N9BnMYHO94s4C2SGzgSrGRQ7WNLRnGoiApsleHGTstEhEpcHr8ugZEKY8OweChmoZoIxSKoYxloQvbdLSI8mHAxG2y1NP45xwxrjZbed2eduPA2hWombkD2aaINnbhKNEmNSS+tgNsTNWbGWVALy44cIRIqbLT11TalMsGaG49v8wGx/F03duLh6rAXq2PM0WeluChJFpaOw+8VJ3c48zsUlFLbBRsUbY5YttUe6Eb9tPwdHGg92NtvjofVgR3klRRlo5swtCkmu3JRusp3dYCluMciM82Dxt558RcUsTLrJa09Fi5DFjLf1ZFu65ZCP9jEr/51AkY8PbpcSnrSpb12dkV+PjKvEECYbzup1uIM9jJx/UpjNyGJnU7nvb/683VlGlRFMoJH/xye2zNBcj0MreLGnxB94FtuAb9ibAtoM7Z3IQnam+xhJZ6FkJz4MoBeXvdjiCgzCwqG207IYGUvyUcb0ZBWmNRlwvX6Pmtsr+mDLgdEL0lfsZJOtdHqiWe1JDOC9QVeK0s8sNk9EGgRvQwPmIHpYu135QHGYJnzxGLRyAxcYN0W/8/WHcXjj30j7OO7n+oBrSMvtpP3a61gr8zPqxzj1su3ArB4IcnO4QE/FgFC7iQui9+hF8EQKincM5/nmGWj5AR3geipaS64Qa98qlcRWDH7iCMu9N6MQRFmfKGObx6UVgjXNS94ArZbnx47DZ5cGVNKHV+rBfrh9HDgpbEcWdojuhcGczoOP+i4x44KUCxedPr8ICNGTxQ8wef3D/udNe9F54rICImWxU51tg3RTi6VVBh45uxfy+mDBgu7w05FLS37kD/H8OGjuxqkIk9SH0RG8yA3GPdhWJV9l1NS2/kXfsHFZf3XSSKLETN1aHJlmtPBmitwwLp27AXxTZXxs9gTHiFaJnUscCgE1JFy2TKJsZ9UKqmv/x2ELoXCZ2JSVvK7FBM0A3ycloY89yBsT96G8O0mj/R3jaVEvk79/NrDs/f3AHhz0AR4gvJJuct4hEFPgafmfgoZj5SZJtdITtwegjpctvKgZnt7zNSdxHzZkzjvshyjYvexUrG1qkv601ZlH/8lYSF0H/QtIhkOEJMf0tY50hPxPUiDzBmOakwhs9JPjSa+pWNqos8Vqy9GYltpDd2g7Hv3DwUn7F2cs5U2X0yGxTFoixiASbiXl84aeqwN+u7mAgJmem2h5av4j/dpcA88FKxu0Fogfa273q1Eyer0YiwTnsUb6EHL43rn/qUQnn44qFLoJrLe3kszZ8JMC/mytTb303EDEcTbAIJ4G5ZI+J6IzfJuRyzK5yirZBfnFcs+3hnmYz+TptJOaRxABNz1XuIjntufdYx/7bXbmqqwZQAij3WYCe70RKsqFgunPvhrDqfvkU2PvG/vVYFVkHIoLGOQw+f2mz9neYz5H7zW0FtkQmVw0sTQSOZ9LFx6sHVnSd3kaVrpbQvXedRGmST+r1gEhkq65hix6fKfafr1uaYQ6/KixCnzIPlJ3ZFML9y6SCieqwAIQjtOC7a2PeUt3ja9WyJoKXJ7LlCtmTM80YZzcSE1kQtMXP+lp6TlE+4mGO+B+FsenMQ4Ijd+ghdJ/6KRWKtOMbHEk0UIbqz6/gCj/RsiqO0eMkreVibr/yEDK9605cQKKkAmIU0k1VWQflMFf4SHp1DWvoJ1c+U5n/hGwMnPYGHfjgH/qMwxl1g5JroOGA5LmXR9kzwGBF6TTEAGYyRXCyS59CKbYTbDB7BIcAWkD2fk80LHyzKU7cdVFQ/VDUHwhOhkhGpo7ji56L3oSRwdBC3HmRijh5HDSfXANwP/nOhdWAooO9k/Y/4ngCx+BmspE/xvstbnkrI4FwZZgA6rfkPJbMtPfryvRDfyX7DO9daZNti9T8UY0LYfldLUA1p7nBQC/mLD+aHJ3wjKZaL/lSYv7MZQunUK8aUixoBeEjiXkXEr891HmWaXg0ppELpJY27pegk/zJf+NoUwSSfZbSHzC4G/+IUmIF4hzEJRUKSH02YohpMoTtqrfiGOP+OpbhWsF0ymRl2CHSDwGsXiOT7F7EX4bY1+VuFCEyrRx3yrgbGQ5RTbUr3GfPQdVxdyrdfrhOD6RlLqT1klUt7XSj+OCIieC9kKsH6ewOhmUeJAfSjcKEd5fwwcdYRm4dffigTwPi90unxF2zXalcEdifbRUP7qKW67PDnffDFtUN/QIIoDu4k7jGPwXDyZ2PdK6nKnNNMnM5udIEhTCq2JHQBfFwHeWuN4A6SJpNW4HSSipZ6vgPOvVXWzJsnrn3QAWSmm9YC39/kzNNxhkKiU8EGY8eF0Fl7aMkNKLYXl86tQuN3A2WH7Bu7V0j8NwZjlTA5lqM8Iglt4M9xwG2GR/X4knL7TscnJu2vA8Vix0nqQzU98OqfZT1pPWtvDZ30/V8BO8UpWkAufZiTdcYg0Vs7oiirYJD2/yBK8aL1IdUpbaZtDxod7d16moVEkK9E3tX6i6rTL/AXHLMqNFkgYlYNC8u35f7yNI8cHrYc28rox5zfs4Gwi3ovIl79OKRrhkE42IXYq2FwhoX8VUXB3yPXx3puTKA0NhwtS9VkPQklVKluiqfVcd2A2KyI+Bi+PeMu0PSel2wbuB8MtdmEzOgvtdQEvgKWqnowW5vKGIhDOx+XQwuOR5p1qqqHmYlSAVMm1OaJdrK9DnXffO9uqgTtiUvuZXMYPQ0Xe31QS8aBm33oYgA1FJhm4I6NJN+VlIbQwNb9c+5r0i0EyRMF7EzsdWWVyaxVrvIeolzSTT4p4D1cKm6O8jfIZd5wbaYJXptlFzq919u7L7rK3oh7h13aLZj15+GjRAQwuyxYgK5J2q5F2jMwGtZOGsM5wE4hHopoUVIiOSG6Zy56ov8AhXsya+5qZB5kUqSx4yTELg+0/7CXkbtKh+dauvlevylFVdtoSBZhH9AvyXUW9uH+lTdBcXW+2f4nZfw4eCZVusClMYyRAGDXpJNijGk8OYLMRs7zBOmrLy96B3ZTVSRJzlhKenq7qRC697r++6J/TgUSAjUhs285lJ9FavYhetHeI/ALMTCK3szoAl1c+cP/Rug3DK2k+hulF1kE4eOsMBlCIsxBnBCwIJ/la9sbIVvE58nIhXuuPy1H4T7BVGyL74UCJY6IORkaGIrZfsEmHXyMpTk1sda70eWIyF8caigyx4vRJmtb/FxBFFgeaEIqCtFU5ui5MuKBshW8UexWCl1S9jtPZCJAesTUwTCetkhYTi1j0+FzFdl2p/Bravl66H/N20vJltgX3Jsgxp2IqZEUuzQ/pAlU+l7liKstVf8M0iPmN+lUbIbOaLBcMwkVZcGpYln5RUZ6Ckt+K+uT40E/lP5cuMBt3liC6orVTyxamyWGwKg/KIvMMzS1WPPrysn0avBBYpvDdCiEOJCS+vxi0X2pw3+8+IAiATCfL0oTeoqV0RXXNt4/0UumZ1eYwPSZsQc73kZAUvsS+6ULR/LnW9+lZsfhlmHuxL4nwLCY2G2SXHqUi9x3lWn5k246pfBJjB6KGkxmAbOIt4e3AkMp9fHRoUT1qhXEilI+NDrwzhvbZkpew9LnvwEH3kXZMahV2Ae2Ff7SLcHsURNo+PqsNaJVhTCSj3JIux3+JV9yGreM5A3nvIm0Vm5UcLMDe8O/G2sKln2ffNk+k/jZuP6KzPZ006qaYlv1Lcr2Ko4yWkUrNgkVdV692KLYHS3KwOvPCgzsUFwp8qwze1JHh0OyloRu387Hb64hVFGRS4rmB/FQ+kbM05hj82M0UlrD9Dh38Ypi5B8zO2pTgSDxr6+LO1UcwIyk5WqcgVKmSZ4Dd3wU9Eyi/h1ZJhOD+Ec32Jst10sHC0pBTwCbdF/LSG5Dbdq2+i1AyAbplCAH+FoVj1jFuTNqPLYyDKJ+CaF71UR/IULEApFnncB01GK5b9dzGgTVp2xC5o13eT4XBWGtanCa7FezIyS0PrpUEI1RVHEkXnhooVghdhPX21b6ME3TGmbgXHVzRYqZ6vmrncBlrm6E/AsU/V3VEf2ThhuE+t0MJsL7MDbUpGswiSTc134UEDu4yRaSbDs3Q9pEmKwLZd9ej7SkyTjg1jY2muN9KlRD3iO44Z8oDEWPDymKo6KwTpT0yaMi+GnrP1DGAlMif3W8BbiruR83LhlSVDo0s4MtfUHFJ+BonpizABGQMBs45SILcYxcjYn4GS02lFncyn3tG3sPVZ/UYi32E3TJ1dK7pZuE6NUf+rY6mLEeeLdv7ebcUrWm2/Y5oHc0uF0WBUrLKC7jnUB0L82B8KIgMAuLJ5LYQrcSD1Z+GSxByEbf9Jqbmgmf3yrjIxi0bYDN/fZlx4EMs+c9vFxq/ZSGBPk5zmbIh5/rEwn468tPyuz7MvSSyRS+m0L66OAVNmUJVnYsIiPNFQIldvnBjOv8VTDilDHtKskCjBVN65Lvhjtu2RrD222d6C9QdvYyLm0YfXM3dPCTUyFQRuZmcxVuSkYAAASZInZptJ6thtxcuo5TxS6/srviz0fo7mO+SPt6zEnQNmR5ZI9iItdrmsl3q8XmXr2t+36K6C9uXfLaNQqae1A79TKqnhzZTGLJBXF/1vnAfFmrhmfepK1c2Crzd68QbndeQlI9Xhlv8vFqsaXD8dN3iYVcoSKYwFd5vkDAsjwHN2I3Xin2A1AMsPby6BGZs6Uq7iF2fl9iNu4MLa3XQNus7DlsS07bExicGOMWrFMEZL4oJXuD0XL9rE5iBQznlNXbqGqDbtxpkoFkCRsLhtc7U9OAV/wfTyAwJGU+hUbZXem++eso6exueymUg5d9+Qc1mhHstowqYBzlgcVFN0Y4W5dTddCBlhxQPsL5evf9YAD2NdAyE41d2WZgGnqxTMzD4S/RNBrjqgvCWAivhJhDA44Pt+XN9wd4lYwUoRU1gVSVPXoQ2rTmiMxGO8LJnnnI2mq/5FaZAWdYCZs+ElIZWiT8TJaebanYi4qTTcE22xnZ1wTG9RUmL4ssNkgh2w4g4sEuznZwcRgFT8EHWIonMMMumRgpvgbLyMMeFJ5aXQiRIbPQ4/6Zr57H9Ge4znUsDusQRyCkspg9uyZ6k9DBOiMVDNEqDGzCIh91sGLNyyxUqZaLHu8puZ7svENnLvwN140iX8vAMlu69lT8PtKQsu1ZSsL5C9eKypZ5DwryCgJcaJmf+dmrvx5bplZwIqMEQZGR6lFlDq9SrhIgZGcnu8+C2XeqoClzRV4VX+khZ8m0BboPbhA2AgfTGDry3fnlf1RfATcXO7rCssPZjlCJng5OLbGPaKJD6AeQGOHk/d4Tv9mxZ4Nzg5RgVjYIMtPaGwezSBCnBwKSfxd8aJDKgoewVQe415Am5nXT7b+snxDPCvdxaR+2YBnAuG1x2jvhN48Eck5kqUsWAgLiJvKmkySXxYk6XOzmMz2bfQJzBwbdjewlMQ1DeDfy9sWZcCa0Jk0GU5l/KCT+2TNucDu0xUTbERrjbzLf7tUY+aRm1tXk131RvIk5UOFrLQIrj9CZwnoeARLvb9lCGBiFePntoNZGTqx7GGTypSsEx4Cw2t7GoG/fO+VHh924vAA3l9IjS/WkPptxRThc4lxLSs3W165UH9R9DShqrLJe51stJ4U7apPNmVgAeXnoTCkslfkAv9e5dEwuDfFF4OT6q29G1dWk1nO+KAGXNIFA1YfpIq5KM3xlMOfNx34LUOEVKpgO+XK9lHhcnqLIdJqIXu4q31FQag8xaSv5cDIeOfcYlobi9PPZ9I63K9pJWEQsUv2XUgT4G9fhHPvsts9+zJe6omSmJxeds+DaJBr1lav4bguWBMGNI9yfnpcC4xJrEh30EK8Sc0gIa6pKYSXNSJ6lx5LPL9K7H+DIhZ7f9fROLmcPxpzDLShZ1jmcPHF7ZfRFyzYdlA2nIbK1EleccT0+m7eduVOelv1MRjRWMZSAveL9OQM9WLJw/xA7vq/GnqXMmb9kNxaPwgd8Bs5Qj4h+oMerpREK1OIeznphgJyb7Z1idjgBDfNzwddVVCrektswbcqviVIH/31Sq1ZXTr5JqH6ly6d8HPPdVjlOqDH6gM76ruxQ6XevbFsnOVZzqU7BCJqk8i0fheb2nXQCDAy7bMF3dantewwbko6ytZXqRhZd8YJz+xREgbxiD+qDdV+aFFH3j+GrzhvgRUH7qUXZfZicZtm7xelh4XXT8LGrW/BL7PjEIls+N+p5f8deuDbxzl2EJhjbqCxkm5rh40elNxddrriVoSdBPamo1/KacA9I5gN5Az5afEbYkb2X1pKZWS62aXZzgilOfG294oww9SLwKoRnd1oeb5M5MUuS+3HijTwPtB9DnKit+kKTfxYTMcA1MMRUhD//cd9MHHQuZPUpVbg4c8HjtVURvCb4exM4ATud1W9xEY46uLg3Fbcf3Pb9UBtY1M1BdJu4HHc282JK5Ph4GM9m0pClCyKuk7k0ku1d9EXu4UjM58SQCq30S0WWjKlS1F/Y/MzyZODVO8WZAKKrqHGduGeO3B1pmUkpCZOkE7HLCkenUDEApr/h9wjW3ZW15CMrGXbIe+NSRsC7r6A+26RGjO9r6nbvqpdS+X8/aVV8skd/3f2UR3smrtJQ62hvcoalpQaPi89mPYpHtja5P2IHuWFMzPEfTt/Y1xTkO5lEYrWUUtxsNzMAxNRvQV5qR0HcrXZYjQEfaT7yafnS36XZb9+dJFRy/+SXwxdCLs94u26JRiGLjPdMih45eDvMMYmZ+yZfOGYCNvC/+9ArxSO+u1YHVjWod1J7abnujHo1w/Xn82FVgN85CPhCcgTPw+iUIhBPch5obhNtAF+iasIx7lACOlpr5VJ4b5oUsrMhLn/Z9pdgrPBQnER2zTgby8YvKnln7UqRmnyUQ+kLDe3bd+NW4/MXjGx5KkrK5TxtIGI/aaNv2KH35AhPPN790HJw8UfQrC5W4wrX8XloGI9kwvRDWWFUv+miHWsr3Chd+7ggqfMXvhR0SbMC2WUOBQfCSb61NQ9lqtYvKF+NHaVkwzwVOZDIorsu2Rb59ZxxLpb18PTtWR7CTBgdDtFK1oXYZtqNg0UBC5Q/Dz6JB6prAJBsQIW3op036WknQQ/gsPlDKXi5CONCHlZxxi6LS+WQYDxXbTDhUyMwuyoLehBFWYsXU7+kENNmSsDXKfxo3WDYPXV5Q11j65ATwVfX4ZRYYFZ0kZ1m3kZXJIqpvUoqQ66aaCiBnspNectz3NO9maJrRuj5+05yCxPzjWgIsuriPB32hemxU4t7+qY2cBLCvuJoIs2HQhGG9XlrGELetO8dgqXImPagGd+UNd1JU85NvVSG8t4ZYrjvGofK5VMGEhIldKb3s6p/vWlJii/KzC1mde+HwXAytat2g2h2PLVMUwePKKJM9x7Kfl+RPGb70hFY1eBL4A9tpREY+mkgL56ODEYcYwVGoYXRryl5aUT8xWz3QjWt/jyfwMzoeTqJwdYqPHBRqTQYa8eeSlpUZAFS4QgtWk7rOu9/IUkWl8k5TKIg6RxEOVfY49jq5cO+mnxyIlcnkPPCkMWuDgvMua0cxcTfUPV3WuLWEotdjRAqwMXveqPcN5jkL6wASlnjg5HA0NhtQAAAlCQyzkS6RghBzhxYZpgdDlDbdtYe87YWpC4zBcxSJ+NqRKyGTIaGdKqt4sRMQY5LLHi6DEBSKEtXSLThgLayUd7MmhT7rRwp2om/kP2ZKnqhzAMY0gmnPTYCORWN5lYdkyKWX2SckyjKG/FxVfq/QoEB0EqTQYiacI3sy36TpQfsBsiBQjOH5jJ4skzbD7sUonAcnX8NVE1ZdfTzfTdhNiHcvCLY/RNfd/4aahGsxuSSUrReLP1PYhx8hHwLGMGOFMC1/5eva2VNZTVjcOKoYzikLryiq2+MvBo+llkP9NSgT5JER6bdKc+/xG435HvdHsNQ88UMPjNCi5QA7EIZbPIfuArEYCc0OCUccBZ9GrMVLBoyZVax/iH29616CL0+kiSxdXP+p6axUa9viQsKMJPMlbrP19QQlj2R2hTKp3Fc1YIpugKu5GHIlkjdjUAreqjHgoGxUIi5+nptUam0ptsBcrlcB5+SlkrqNUxqUhSyY/zCjacp6KNz2Xqp7RDJRHyjIeO5zg0fURQGR+JVNNc/ZS8OyHBCQU9jqnYu6uxn2wlne2kbnSAMg+ujIhN4L1NtbpgXq78KbgR2dl+n/+k7QtaEsQOrcwCsHtOe02kq6yRtgfvt0VPHW1G7ycFFl41JgbqV0X57HEYRWdnGyV7RwfBjwpa7pd45YADufW02vqu9P9JF3LVNweyCH9xh0AyzGzRBdwGcRFP8wRMV1Vn4IdB77XBJQ7/YlXVm/XTIKVt15vkjIOBfnWoNcaEEnA84P7HBKk00/gMcz39JOk6apDq09TLhlE8NyW7gXTV42fOM52FsAsSZ19+aKm1Hk0P+o45hvyenVGEbYXlrHE1haMKMzR8B/+/m3CVLUH3oP90EERpRcv+eL++jtmlKBeRV6leZ8JkTZPhgFLxjXHHAOL0upHkTqylkQa9Y97fhRaJJLi6R39Lr8kWbWPlNeFVDoXPvj7+6b3RkhY/I2Hyhm96sWJpAHHnRG4cqpk9CKGlGXC8yay807c6NfUlnNB+Nv3ZWWhW60AOURa8HOtlflVb0p+U4xB88mlhDrom5mxra6L0sr2CWdr1zrSWOBOtfV2ybsxQduxB+XGBQi6yCc7IJMGqRj9YbI+xgS0hll7BgaAql0STcCbWVtcivpRHQFNRxUMFRdte5gsUw6R167SmeKnrJkp6v1cSSmg8yMIcMUwgfV3FHFHveKrm0CAy/Vzdksqsh2y7B0ebbe4whhDzZW95nl7Z706As3GkxRXf3r7Y6eVk+C497HOsQFUBs4+nYd8jHVvUbd2Sr8z2+ITNR9CrmF6ERKF9I1Zqu/iDzCpFqQ3cPQ8rMg3JEuZzbH2Gl+fFjMPxclrP4b6gtiXMeKxqBPwgIVAb1rkpNr8L/lZACsD4xCaOue1IVKOtOzK5+OiZN2Ef6llsYRq+N+Ya1togk49PfE1TTgKZKFU00jyuYqepSOZuYMO4MyoG157ReeuO/eYg81AQ3Dwt8ZBiMS7v9AVYbBfNL/WZXvByyWy1e9k+Xfqb2UZohepk/hONI3+YI8oMTcUb33WLl4q9eEeQGdN0MOTW3rcZVi5HzMfEE7u+lM1MoE4OOfyuv+l5J2gflJU0PgWjyIBbEibQS2lgacqenfKUQrdsJME3pdNZZbMq4TYhm9z7Y1wctrXdF7oz5EacrerpYuEGin3SOFzLoha32cKlsI6wghyr5ALct4r/vW1UcAsWgn+t4dggy9pNa33aAh6e+PnG+kVdhzJ0w6ZMnQcbvFF/vq5cZisoV4hTRXcd/W+1hdRiDF6RHKmTvy2JF7rf7ze87/H0ZcUBamE5MMrvGdwCXp8MrTtNYQZmzyZ6s2M4uZO3xoKhFBe2WaoeLZwUbalZRYD+laOmblvxdY/WZ8W6S6DZsxhfjGRQulgl3anbFzbM5wlMeeBcUvsqjpWBLSNmEjzIZUAhq8ou7SGGFiL4Zj1GBxDTHnibY1OmEXGyQgwLKbMnAQSJTPe2NhNwc8N1WfygcrZ0J64CfOujrIkTnUCj/dWBveW2GnG8WsjUpl6M4t8EQ+HiIL4x+ZlLBb5G2CCc3aZxNh+c/dKK3l5TBo9WBQRV+95lgSauezrzXcux+XTtHYBIMuaonPFqEoVOYwTNXY5T4lba7IhBfE9+5JBLlbX2Is2HYfeJppTbPPd8P34+4HY8F7LmEfX1kF0mBd1jmkSiWoKHjyG6ENCnp1z9+KstkYJuOD/h7oW9j7riVvK+dm1X7ZuWzp74y6h0kuOVhA2ZUhvCdD+Ru4vetHfElVsm/CrIGCuvGXr94OhgN9iwtL6YKZ507OoWLLO8nl8X5tuZbI2DAHxSXcHtxSKq2Vyz04ewBpAjeSgsm4lJNlamZiJtL4sVYqlSziGKOrRe2cSP0V9WqShlWe6M8nP55aw9MO57JV+WzFuT/4+oQAob3pcelDKIrGZdCR7CwDyDweExQS6K9EcPlQdB2OK5Oa6aqxFyau/DSrdUO/2+ZY/BTYigumv96Ra/xESX6i7Z3c9hbAT1WohRs/oo7LXAY04eIoRdC88rBlu+zDCLWilm2fsIZQfzY0W+YPKhkNY+KI8+W8+NXqjJshMUVwjVuRTPFTB8LM7gBAMtO0ZXfwPzBKhFrH8Oo1YZOjYcBqp+/RfQMM38o3/xIu9vUk6W8plCsQXpE+tZzJXkpxUsMMPCN9r5XrZmqVkyjocw4fmh3KHyzaIlJxlpASyAWOBWYvSQOn560WhXGebG+YfBw9gjLZJADZjMxZaOhESgWgKO/kV3c5oQ/K63rE4XPz9AAAIKM7ATBwzLSjBpD2Il1DIEuM6ixn61eybnAAPUFiuG2q3DdBdLiz/9MNoihXro9bZUxOWfYa1rpUdGqSTgamoFtDEEsjDUDof13UUF20wTWbC15iaj31RcM35kWNZ3nLvdEqiiLKdD+FbQ0uzhXo3pSfadReSzYaLsdn13ocZGx9xYbtd/tEraZbKS/827S8D7ljHiC9a77+8y5/gbW08AIkOVGrmFAQ5ghVaCDOSHSkT8QNq6oIMASb70hrwz5j5KoVmZagX8BGL+GuFachEDnSwcnt75xHfosLnM2YY2V6+/VXQouRSrPDfOVom9Uvr6L3/lFInxjjO/FdNvov226/d2J8RYrW3ULRoLmmUDY6XWV8iJZrpbcPKXXI1CptWAUCIntIopcnbK4STa3L4fSOVQMUs83CrHOE7qZr9hilIAtHwR6V9zqhJM/YdrvaBR85QttSBTB7WWeE+dukso4jUREf8QL9QKfGmMkAwzd9m1zuWER31ZDYafcoNglFx5SWfT+urTPM5jqGvNZuHMpB7eEhRO82AJP3lFdx/caSdeGuKvo5y7CmO6KK7O70lRASlNQ0VXqooZdwcKIj4dyGslDpNAhnSJERKldlkSgOoKdBtLN8YtbFP2pOAl5HXYojpl9yDkttKtRqWfWrLqKA+e3jeIlRZ6/Yp7whTspAVAkyXkhu/51tuz5hIxMx33G0d6BgziFAYyOJtA9dnrxgbBiXcv363mrDcH6RZrsAVMMFna270Ha9OKSfc18/7JNbakd/bxnyY8t4qepN/4euH5UcsLmJ7pkfwiLe19df9Du47C6yd+VRvdw6wG9v+ya4W8cerqfH2Sg4d6XhGz+VKsZHBOH958MqkQSQys3VRzp6hQvT+caXgmxXDPlNmdHGtgUTF5ODXJ4VtYszpfCSQVkQkYdwQZ0XYEdaxzeImjgDA5ENRjA2+VHT1ESpKE7KwDkQm9KOp6agqUKszd5S6ubIghMGGDeyQ9bGpMqgWU5+3/xYLb6xBmxDruGQLdyx+IRgoMggTs9PC/WJKnHLfj0j44QQYIEe7PxtrO+PcVzE7VY7FPU/xX9URU0FYCSFcle05qEdECp4Lz+U5SdmkTUlnO/Ix9ZZXkPFbEAAquv3N9SOyQeh/HUO1zd64W/zdGNko9JQLIBgvFwFGIMCmw+HW/AC/c0zKe+k7/Bbn50CM0tx+UMFnbfJYGCxIQQmR8SfuKa/+tHxQ2wSpNC8vUhPwXgGlibPAOGaou3hjKogP68Q4lUQhVQLyYak9VdyBbUeQhU7L2HXX3We6hK0se9boRi7QPnzmofLI1B6Rvmfcis/0KgwELcdfm7+5ZkC+e6UQaXgWi1c8gYxQ8feYGggyeE3awcd65lzxyWZ6nMC+JlmZsYmxGu1Hzn+O1TLYPwxwF5uqzRrFgmOtzLp5YhjGPWhBlODTL2V1sQ14RJTbexVpf6wXoxb9mpwWyZho25RyKZlKilfkOAL8fe/MkgAWfIFiPCuF2O8JTfy5uSVR/1mDVtcwe4ZPlAFnwcROCTBd3AylwfGlTI493dubAhXNr/YQ4zhBjpbVYb3CDzs990xM5aa8uZDQRBdKhe+sVMG+RG24cSrN7zaeKofAfHgpqQDsSPRZpH2ziWLGUbTsw0B+usw8Kc0JlXTC/DwKK+nV+baxPc4VhJGgto9xlb07WAG8UERnAUORiA6AJ31GKHPFOrHx5HiyA7xaApigiSgmnVOanqLvtbT3v2WwgJ2og1XF8q/+0Rh4a6fEUfQCAJLv5/v+2WQCLi3B5s+ZeGIf7eoxiZ0YzebGwpHLYOnJNNyBB+DKc4NttYwvG0zZo1BRWFMOFFnG1P/8prv+G+fBnAJmMu0pd7CHevZHKm1QYiPzuLci+PJTPT1f9DQ0XEqUPiRtUFqP5aZ+zk19TbhQsJoawk5lNLy0NoVI1DiEJMdDnId35JWS0CbDf9lTCosS3fdrJpOaI+fPHnxslTDYPDXOLPS6Iy5xEhhxUzSldphVBd4e6OFjqVAE/sjgwjTmPluHuArIoDrLRiH7jEs6xV4UAXGDRvlrfURXrZTJGHFD1l+QJN2nrwfl2U9GKRjg9rZk+tm9ISvELCtADTSBQBQ4tCL7hWsLRIxzoXfLs//8Th/+JBf/8QBpfuR0EU1BQ8AASwBK6BTCztLq6pWmnrPqX6TI39Q5T2h9HvglW8vGTzTfz/1GODck9uDLYgcJ4s6klQk3bYQWZeZN1W8jJTggpuYTldSkfd3MAlWHU1n7JpKKyQmULO3OaCb3zs3fb6V2EU7a7uBU35hdO38kE6MaULHim3bcWHqA5CfGLVoW1rCYdHA3QtFYM7TeAFhYJIH8c/U6VoDBRL7QD0JbaEYF2wLAgD5HYBRRUIbIqjvlh415NHfebo82uQa4/nC9G7Yk0PZWQWgbbOlL/0t5CqGqR4PRmSIUYqjkKEEzWU3NLTqrH1W9ftCLg5iAcRC37UCnaS/FqZkdxHfGmXNeSPYMGmCwjmSkAvlqBMOiyzHJs5dAnvRtz/Uuoz5+PIoxOecq65TqKN+OP/k7bFRUJJOtxEYJtdKo1OsKU9yv30BVYBLbOMJmVsXt4ZkatzqszbpK7ZiQCCA6hZEFZcPPwOicX4Uq7BFiP7OVUH5XHckXZ6pkqo47/w29S4qvdZrAw80XvgVoNg+JJHaUrlC91PgV5J7TlyeGuiQGAqoSDGXs+1c46Y+XmhloE4Z7SYOuLT8P6Dx6OaGrN9kYXPXbbR8WinNlzczbtNoH5vhkBUm3YUZR3X0I1bON+lVFYVXjcMJCbQGBQyWG+jdMqH1wMSs7xgNHHZJUGjO67yibGuWW71XCEBQS8VFdVsj97cNzjc6ujFnvxBgCgUmFKmoJxRD7ieD9hcbLslqG2H5sN34HDga/jSnW19fSAmo44hzChQYndKEaNBc0SN0/LFFoizP0gtAV2GInsKVteSTQIBm3+Y2uFPSYNJxhTGI+eMAZf25fHOMhQRNaMK4hcbxdSasRORvcemos6s0K8qYf1QzAHQMiYW4xT9odFc3586jmsiG6iDSOWST9R3zMaKqPwa6q+10mPvzaSu5a/pFMSdF81K7Mgja7iQq+tcm1WUJX5VwlCEp8qlItHzsWZqDeNiIz0lxZykjjMvLxKT/HLPv47ekpgAyPrYMnqJibWEkGBKQOSs8gPGiGcYfJB5zmoJYJy5pHS/LdDbJl3zBEA4fuPGFP3Y3sUBA0vFkKKFhZhXsF153H0Fn3xbm0jzA3vChI45p97FCiiwRFZfAqjPwf6v3C6Oa2ilE177wAoof6YCKhHPDuUI/we4aVnY8zk+4xxUPrLkiDqJ5xVtQIodXSFAb4RKNtDgQSAovDeD3t0XR/PMKu8xNytqLDExMjv3O11PyWe4gX09zK4m6CFwGibb5bzW669X+xZhMAZUPvfYXdyBKBxIXsTVDtUUWIDWFR/67NIp1rsGYelbfwy34XrdbqvwP1BIFypuNLjWxD6T9+2R88Z+Eze/N6W0zY0NnopPBi/q41naeF/fJAphJP7q3kQ32G/K141OaC9wPLH5bkzVekNpspNENo4mScXVIdhtc7luF5bTSOuGtvNd/N99VJm827jfgE+8i5zCnT+RixfAntuKrKL/reinksse25WMunJ+nNYohiD2b5raml0q9Q42CVroc7u3Fd1zf+aHf8aLBof1PX0gtpXL/rNZr7L7EYLnJxEux5i3mUGC5dpERtkCnWrsYLnMeBCK4xjikhmMF9C4+hiL7+UDEcLASBvci/To2pbSql5IZtOD2vZ4eEw7bnuCXN0zzBsJqB9yFY5Zi6OdfSqiWUoNNUl3YbPZasBjnv767bAxIj9LthKvjOfscZqMrioRB2GVc/Oc7+egOx7CqJiLDZHhNzLJPfFmorzZwDAq34BVHoNiUV9sZFPDYJ1kh7Z8XSV4r7Hu+6Wf87fTyOC3fm/D9Y7yfjyCl7SbxT94q2RcPc46l22MIOt4moFnI2RBQe42umgTSHVVR4uwnAT1c5cZNOahVYhf6+mwyc+yvskhcJhrgZ6qra9qHyhcHnM6K/i7O0lhmTVX2u3o1UGk9iBS5NHOnECizcBSz5jidX9XLycjKBE7n+odn7V6OikRlk2+t1PdSuXq3TCvcp/D8G/KrXpjznDxjjqp4uNAvVvlO/5SBz6gISNBKPUsAfQ5BZ3Rms/Rx0T/Tq3EQO2/wuidZDuwas3HewsxTdHrkefKCuLNrOEN1XaZnnVm3SYMeNwcC8Y4jaf+BqUfGg7jBgdX/mPWtK0u72jQ8AhjG+PdVA9Jl0xV0gghWT2H9mVbiRB1WKJGymnIdI029RtF6xHpRMUJqtVWqo3ztoCZa4lI7VEay0p4ssUityf8GgXdq4rSuLiczNIthtmk9sdU3F5GIrnZ6J2EOJs4AAAAAFnqkAZ5GzG7RIFiOa+t7WmGAYG/NSPT+1ob0MzFG5JK5aZAqG0dgBn+9BvKbqzD21QL0dPbmpP6LOYnhFXOnrCNHWqRWM/CzYCsBrFFROvZ+LszRoex5cZTRpInoxvHwGPtqPxGisF1wBZO5PibbYxXYk7l15dV9mjfNlct3VX3nbUz4FpebZHlw+LG3xS6AcubdDWPS/cKCirJH1A74paZvVKahY1wGp5xGIuGC0Fsm87vPxv8BG172N7vInVNcPPblMi3RVAnWwl8Dv4W04fb3MOcfxAQn7RJonddfgu2KrubP++79R00VScZo4873uDC4qWVEkiXDz9MILTNkuidHhovrnIZcp01grQtmdC0fioH0JisAHChZL+7+7nfAXCOezPFUVN4j0ezHxF6adRy+wS8OFOMB+9SrtHhVD24Suf9xB6V41ZMy+qu/W/R19Jdg9vjlUJRCrhoo2bxHdSt5R4E/jJYWLXcZekFj+mgyt7JWHTH9AqtzQOdUdi/ojwDgrHwhO2+PhLXvGsfKeqqz2gvLtBLX/c7/BuxNhq8EeqrNKfQXOeKLHquvrKdMDLHQihOjOx7nNiexTo4sddiyc0g6anv/ElMltdkzTxmj8BFC7hdFf5oGAhWmN/OCaboJJdiKr3JjIxQn/drB5wZPZtk6Yqs+AyFqlJ6KOJ78kSXHgVxfkIIZxvL1Xp1WDUygQq5SJS/8LCvLTgz2ychWUNMcNL9jJUnM2qnuLsELTNn8grNjOm5uQ/98kc6UsG6q1SvT/FhocZ6SgV8mA/xc1z8PqwfDdchyO7eLkzJSVz5/71vNUfI/zzp7PeaShTDOHlAkUMoVkp2CRkyA/eWsRvmhyB1VT/M7eiEkXh7iV1etVqMyAjn32HWHyxy5x9+bnyaAo1c//qaU7KKW3CZUUHKTOEwde3b6RfyXKoW24QOyNWTpBKpLQ3mGrZLxb4wMay0cRo9y1P7t7vmIYNqxhnHCccZXp2O7GEUkdLoSrsyRV3Hbx4qq9CqlprN1xJQ5T30tSxrOpO+j8FaP5C1p17ng5Xu6QcO/D6t/qvWUU57ECAqhT4s9Yr6tTJg4HzdRqj6vA/Hc1S/H1J7wD6rm/zlS6SZMOtJQ8o9YcQVKdl2nkPsh0l1vgIALwAbVtGRhC81vOvtYxxObWLM320V5uoWkz+xC70nupk362Y3bAmjhT2ZHGUyF82vvMJ0Eym5xW57TepDLeFkCGnjBiZ7e06+5QQ1dKAqq4gr4wbNhm6KRMAt4SYclM+GfMwlIN0eoDmE2bQinYIoW33NFv69T6oFBWR0V8A8QTWOJLtABgsaTe9wAa8SdQiN8w30o1KazBABsUWN/HAFVQAAAQuYAC+AAACI1mbNuDk38+FzMxvTHDuGBIHzl/p/Dz0IEKjtkszNCqq3bY4QqDfMPCWjg+UyRD37za6UNiZwIJoH/R3vGvdZ5aJE+7VuNcjr5aRoXmaFCKoL3B21lOshs0/+uKuStY56haCWFgpr9MoVVqTcssQcomTvUVhbStsc+yRmO2l50huV18DBZbsEUd6HOalKiC/1X/QNTJ8DqJwby4VITjgTmDI2li6G6ieDbdHJoTMgs1GDLLPVMwLlM39JPSiq4fewzVoIM3CNVnPe6R2yENuABUjOrlTW7MrztxVNZurcGMBEgv9WNvRMrTbxzicFa7iu56Nuu/Lo1pd8uorw2cuWaXVwAsPeoLroWYiephyDRzWbaEMKa+aCer3IOtmsM2OlrKKWsGK1MvEHnP12OiVPDC+wK+jmC/WnXmBhnZI0ZfgBKNp9R8rloD+OeYKK2f1KQeAEOjQv/eWVBDER4wkAX/wc9xJTsgdZXUU5TJ1OkNPjZ0AkA3cd4D2BFJpRlnHVNrnzJolTjSaiQjBHcVefLh5aG11g0gF0hN74Rb/1ey/IAAAAAAAAAAABv6CKsrN/PsS48GGvf0XV5y2ohsOhcqkEtgIepw/ALZnYDxekZKu9CClLlqnohgkgxH/yQ5/TR+drlpJLWpvAw16q4x+wDIEi+Eipeynr+B2Xeijs3lsSe47yy7YLKMeB30mmAeZZ+TT/3XgjBTzH7lrM6cHdrlifMQJg6L+T+cNQRR1ZkTXglAvWCEoXD1SSSe+gqz/DPHw/+wp8RnqKQI95FqtyYcg0+CDDKJseArPUqfLnkYzJLL1ic71eoxhgAAARxwAAAA=";

  let browserPromise=null;
  async function getBrowser(){
    if(browserPromise){
      try{
        const b=await browserPromise;
        if(b?.isConnected())return b;
      }catch{}
      browserPromise=null;
    }
    browserPromise=(async()=>{
      const executablePath=await chromiumBinary.executablePath();
      const baseArgs=Array.isArray(chromiumBinary.args)?chromiumBinary.args:[];
      const args=baseArgs.filter(a=>String(a)!=='--single-process');
      for(const a of ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']){
        if(!args.includes(a))args.push(a);
      }
      const b=await chromium.launch({executablePath,args,headless:true});
      b.on('disconnected',()=>{browserPromise=null;});
      return b;
    })().catch(e=>{browserPromise=null;throw e;});
    return browserPromise;
  }

  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const ticketNumber=v=>{const s=String(v??'');return s.includes('-')?s.split('-')[0]:s;};
  const dateBR=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'});};
  const dateTimeBR=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};

  async function makeHtml(order,booksOverride=null){
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const books=Array.isArray(booksOverride)&&booksOverride.length?booksOverride:(Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{bookletNumber:order?.official_sale_id||'-',lotNumber:1,tickets:[]}]);
    const name=String(p.customerName||order?.customer_name||'-');
    const phone=String(p.customerPhone||order?.phone||order?.contact_phone||'-');
    const seller=String(p.sellerName||'—')+(p.sellerPhone?' – '+String(p.sellerPhone):'');
    const drawTitle=String(p.drawTitle||'REINO DA SORTE');
    const prize=p.drawDescription?drawTitle+' - '+String(p.drawDescription):drawTitle;
    const dd=dateBR(p.drawDate),sd=dateTimeBR(p.createdAt||order?.created_at);
    const publicUrl=String(p.publicUrl||'https://admin.reinodasorte.com.br/');
    const logo=logoB64?'data:image/webp;base64,'+logoB64:'';
    const cards=[];
    for(const b of books){
      const nums=Array.isArray(b?.tickets)?b.tickets:[];
      let cells='';
      for(const v of nums)cells+='<div class="num">'+esc(ticketNumber(v))+'</div>';
      let qr='';
      try{if(QR)qr=await QR.toDataURL(publicUrl,{errorCorrectionLevel:'M',margin:0,width:100});}catch{}
      const label=esc(String(b?.bookletLabel||((b?.bookletNumber||'-')+'-'+(b?.lotNumber||1))));
      const logoHtml=logo?'<img class="official-logo" src="'+logo+'" alt="Reino da Sorte">':'<div class="logo-fallback">REINO<br><strong>DA SORTE</strong></div>';
      cards.push('<div class="ticket-horizontal">'+
        '<div class="ticket-blue">'+
          '<div class="topline"><div>Data do Sorteio: '+esc(dd)+'</div><div>Data da Venda: '+esc(sd)+'</div></div>'+
          '<div class="main-blue">'+
            '<div class="logo-col">'+logoHtml+'<span>JARDIM - CEARÁ</span></div>'+
            '<div class="numbers-col">'+
              '<div class="numbers-title"><i></i><span>Números da Sorte</span><i></i></div>'+
              '<div class="numbers-grid">'+cells+'</div>'+
            '</div>'+
          '</div>'+
          '<div class="deadline">PRAZO PARA O GANHADOR SE APRESENTAR<br><b>ATÉ AS 09H DO DIA SEGUINTE</b></div>'+
        '</div>'+
        '<div class="split-line"></div>'+
        '<div class="ticket-gray">'+
          '<div class="info-col">'+
            '<div class="seller"><b>Vendedor:</b> '+esc(seller)+'</div>'+
            '<div class="line-field"><b>Nome:</b><span>'+esc(name)+'</span></div>'+
            '<div class="line-field"><b>Telefone:</b><span>'+esc(phone)+'</span></div>'+
            '<div class="line-field"><b>Prêmio:</b><span>'+esc(prize)+'</span></div>'+
            '<div class="contacts"><span class="ig">◎</span><span>@reinodasorteoficial</span><span class="wa">◉</span><span>(88) 9 9494-3632</span></div>'+
          '</div>'+
          '<div class="qrbox"><span>Acompanhar sorteio</span>'+(qr?'<img src="'+qr+'">':'<div class="qr-placeholder">QR Code</div>')+'<strong>'+label+'</strong></div>'+
        '</div>'+
      '</div>');
    }
    const singleCard=cards.length===1;
    const cols=singleCard?1:2;
    const sheetWidth=singleCard?800:1660;
    const rows=Math.max(1,Math.ceil(cards.length/cols));
    const sheetHeight=singleCard?560:20+(rows*580);
    const pad=singleCard?0:20;
    const gap=singleCard?0:20;
    return '<!doctype html><html><head><meta charset="utf-8"><style>'+
      '@page{margin:0;size:'+sheetWidth+'px '+sheetHeight+'px}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#1f2937}'+
      '.sheet{width:'+sheetWidth+'px;height:'+sheetHeight+'px;padding:'+pad+'px;display:grid;grid-template-columns:repeat('+cols+',800px);grid-auto-rows:560px;gap:'+gap+'px;background:#fff;align-items:start}'+
      '.ticket-horizontal{width:800px;height:560px;background:#fff;border:2px dashed #9ca3af;border-radius:12px;display:flex;flex-direction:column;position:relative;overflow:hidden;font-family:Montserrat,"Segoe UI",sans-serif;color:#1f2937;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}'+
      '.ticket-blue{height:58%;width:100%;padding:24px;display:flex;flex-direction:column;justify-content:space-between;background:#c7def0;z-index:10;position:relative}'+
      '.topline{display:flex;justify-content:space-between;align-items:flex-start;width:100%;color:#172554;font-weight:700;font-size:18px;text-shadow:0 1px 2px rgba(255,255,255,.3)}'+
      '.main-blue{display:flex;justify-content:space-between;align-items:center;flex:1;margin-top:8px;position:relative;z-index:1}'+
      '.logo-col{width:28%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-right:16px;text-align:center}.official-logo{display:block;width:100%;max-width:190px;max-height:170px;height:auto;object-fit:contain;object-position:center;image-rendering:auto}.logo-col>span{font-size:10px;font-weight:800;color:#1e3a8a;letter-spacing:.1em;margin-top:4px}.logo-fallback{font-size:28px;line-height:.85;color:#17458a;font-weight:800;text-align:center;text-shadow:0 2px 2px rgba(255,255,255,.5)}.logo-fallback strong{font-size:32px}'+
      '.numbers-col{width:72%;display:flex;flex-direction:column}.numbers-title{display:flex;align-items:center;justify-content:center;margin-bottom:12px}.numbers-title i{flex-grow:1;height:2px;background:rgba(30,58,138,.2);border-radius:999px}.numbers-title span{margin:0 12px;font-size:14px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.1em;text-shadow:0 1px 2px rgba(255,255,255,.3)}'+
      '.numbers-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.num{background:rgba(255,255,255,.95);border-radius:6px;box-shadow:0 2px 6px rgba(30,58,138,.18);border:1px solid #93c5fd;text-align:center;padding:6px 0;font-weight:700;font-size:14px;letter-spacing:-.02em;color:#1f2937}'+
      '.deadline{width:100%;text-align:right;margin-top:12px;position:relative;z-index:1;font-size:11px;font-weight:700;line-height:1.3;text-transform:uppercase;color:#1e3a5f;text-shadow:0 1px 1px rgba(255,255,255,.9)}'+
      '.split-line{width:100%;height:0;border-top:2px dashed #9ca3af;position:absolute;top:58%;left:0;z-index:20}'+
      '.ticket-gray{background:#f0f2f5;height:42%;width:100%;padding:32px 24px 24px;display:flex;justify-content:space-between;z-index:10}.info-col{width:72%;display:flex;flex-direction:column;justify-content:space-between;padding-right:16px}.seller{font-size:14px;margin-bottom:12px;color:#374151}.line-field{display:flex;align-items:flex-end;width:100%;margin-top:16px}.line-field b{font-weight:700;font-size:16px;margin-right:12px;color:#1f2937;padding-bottom:4px}.line-field span{flex-grow:1;border-bottom:1px dashed #6b7280;font-size:15px;font-weight:700;color:#111827;padding:0 0 4px 8px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.contacts{display:flex;align-items:center;gap:8px;margin-top:auto;font-size:14px;font-weight:600;color:#374151}.contacts .ig{color:#db2777;font-size:22px}.contacts .wa{color:#22c55e;font-size:18px;margin-left:16px}'+
      '.qrbox{width:26%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dotted #9ca3af;border-radius:8px;padding:8px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}.qrbox>span{font-size:12px;font-weight:700;letter-spacing:-.02em;color:#1f2937;margin-bottom:8px}.qrbox img{display:block;width:100px;height:100px}.qrbox strong{font-weight:700;font-size:18px;letter-spacing:.05em;color:#1e3a8a;margin-top:4px}.qr-placeholder{width:100px;height:100px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af}'+
      '</style></head><body><div class="sheet">'+cards.join('')+'</div></body></html>';
  }

  async function getSheetSize(order,booksOverride=null){
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const books=Array.isArray(booksOverride)&&booksOverride.length?booksOverride:(Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{tickets:[]}]);
    const singleCard=books.length===1;
    const cols=singleCard?1:2;
    const rows=Math.max(1,Math.ceil(books.length/cols));
    return {width:singleCard?800:1660,height:singleCard?560:20+(rows*580)};
  }

  async function renderPng(order,booksOverride=null){
    let lastErr=null;
    for(let attempt=1;attempt<=2;attempt++){
      let browser=null,page=null;
      try{
        browser=await getBrowser();
        if(!browser?.isConnected())throw new Error('Chromium desconectado.');
        const sheet=await getSheetSize(order,booksOverride);
        page=await browser.newPage({viewport:{width:sheet.width,height:sheet.height},deviceScaleFactor:1});
        await page.setContent(await makeHtml(order,booksOverride),{waitUntil:'load'});
        await page.evaluate(()=>document.fonts?.ready);
        await page.waitForTimeout(150);
        return await page.locator('.sheet').screenshot({type:'png'});
      }catch(e){
        lastErr=e;
        browserPromise=null;
        try{if(page)await page.close().catch(()=>{});}catch{}
        try{if(browser&&browser.isConnected())await browser.close().catch(()=>{});}catch{}
        if(attempt<2)continue;
      }
    }
    throw lastErr||new Error('Falha ao renderizar bilhete.');
  }

  async function renderPdf(order){
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const allBooks=Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{bookletNumber:order?.official_sale_id||'-',lotNumber:1,tickets:[]}];
    const MAX_BOOKLETS_PER_PAGE=50;
    const pages=[];
    for(let i=0;i<allBooks.length;i+=MAX_BOOKLETS_PER_PAGE){
      const pageBooks=allBooks.slice(i,i+MAX_BOOKLETS_PER_PAGE);
      const png=await renderPng(order,pageBooks);
      const sheet=await getSheetSize(order,pageBooks);
      pages.push({png,sheet});
    }
    const first=pages[0];
    const chunks=[];
    const doc=new PDFDocument({size:[first.sheet.width,first.sheet.height],margin:0,compress:true});
    doc.on('data',c=>chunks.push(c));
    const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    for(let i=0;i<pages.length;i++){
      const pg=pages[i];
      if(i>0)doc.addPage({size:[pg.sheet.width,pg.sheet.height],margin:0});
      doc.image(pg.png,0,0,{width:pg.sheet.width,height:pg.sheet.height});
    }
    doc.end();
    return done;
  }

  async function archive(order,pdf,sentAt=null){
    const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
    const row={order_id:order.id,seller_id:sid||order.seller_id||null,order_code:String(order.code||''),customer_name:order.customer_name||null,customer_phone:normalizeBR(order.phone||order.contact_phone||'')||null,official_sale_id:String(order.official_sale_id||'')||null,file_name:'bilhetes-'+order.code+'.pdf',mime_type:'application/pdf',pdf_base64:pdf.toString('base64'),sent_at:sentAt,updated_at:nowISO()};
    const ex=await one('rds10_ticket_documents','select=id&order_id=eq.'+encodeURIComponent(order.id));
    if(ex?.id)await patch('rds10_ticket_documents','id=eq.'+encodeURIComponent(ex.id),row);else await insert('rds10_ticket_documents',row);
  }

  const rawSend=sendToJid;
  sendToJid=async(jid,content)=>{
    try{
      const m=String(content?.fileName||'').match(/bilhetes-(RDS-[A-Z0-9]{6,12})\\.pdf/i);
      if(m&&content?.document){
        const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
        const f=sid?'select=*&code=eq.'+encodeURIComponent(m[1])+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&code=eq.'+encodeURIComponent(m[1]);
        const o=await one('rds10_orders',f);
        if(o){
          const b=await renderPdf(o);await archive(o,b);
          console.log('[RDS TICKET CHROMIUM] modelo visual renderizado '+o.code);
          return rawSend(jid,{...content,document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf'});
        }
      }
    }catch(e){console.error('[RDS TICKET CHROMIUM] envio:',e?.message||e);}
    return rawSend(jid,content);
  };

  app.get('/api/rds/ticket-png/:id',async(req,res)=>{
    try{
      const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id));
      if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});
      const b=await renderPng(o);
      res.setHeader('Content-Type','image/png');res.setHeader('Content-Disposition','inline; filename="bilhetes-'+o.code+'.png"');
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.end(b);
    }catch(e){console.error('[RDS TICKET CHROMIUM] PNG:',e?.stack||e);res.status(500).json({ok:false,error:String(e?.message||e)});}
  });

  app.get('/api/rds/ticket-pdf/:id',async(req,res)=>{
    try{
      const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id));
      if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});
      const b=await renderPdf(o);await archive(o,b);
      res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="bilhetes-'+o.code+'.pdf"');
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.end(b);
    }catch(e){console.error('[RDS TICKET CHROMIUM] PDF:',e?.stack||e);res.status(500).json({ok:false,error:String(e?.message||e)});}
  });

  app.post('/api/rds/ticket-pdf/:id/resend',async(req,res)=>{
    try{
      const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
      const f=sid?'select=*&id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&id=eq.'+encodeURIComponent(req.params.id);
      const o=await one('rds10_orders',f);
      if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});
      const phone=normalizeBR(o.phone||o.contact_phone||o.official_ticket_payload?.customerPhone||'');
      if(!phone)throw new Error('Telefone do cliente não informado.');
      const target=await ensureTargetJid(phone);if(!target?.jid)throw new Error('WhatsApp não localizado.');
      const b=await renderPdf(o);await archive(o,b,nowISO());
      const s=await rawSend(target.jid,{document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf',fileName:'bilhetes-'+o.code+'.pdf'});
      if(!s?.key?.id)throw new Error('WhatsApp não confirmou o envio.');
      await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+o.code+' — Reenvio manual',status:'ENVIADA',waId:s.key.id,raw:{manualResend:true,order:o.code,saleId:o.official_sale_id||null}});
      await patch('rds10_ticket_documents','order_id=eq.'+encodeURIComponent(o.id),{sent_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
      res.json({ok:true,waMessageId:s.key.id});
    }catch(e){res.status(500).json({ok:false,error:String(e?.message||e)});}
  });

  app.get('/api/rds/ticket-archive',async(req,res)=>{
    try{
      const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,q=String(req.query.search||'').trim();
      let af=sid?'select=*&seller_id=eq.'+encodeURIComponent(sid):'select=*';
      if(q)af+='&or=(order_code.ilike.*'+encodeURIComponent(q)+'*,customer_name.ilike.*'+encodeURIComponent(q)+'*,customer_phone.ilike.*'+encodeURIComponent(q)+'*,official_sale_id.ilike.*'+encodeURIComponent(q)+'*)';
      af+='&order=created_at.desc&limit=200';
      const docs=await list('rds10_ticket_documents',af);
      const seen=new Set((docs||[]).map(x=>String(x.order_id||'')));
      let of=sid?'select=*&seller_id=eq.'+encodeURIComponent(sid)+'&status=eq.CONCLUIDO&official_sale_id=not.is.null':'select=*&status=eq.CONCLUIDO&official_sale_id=not.is.null';
      if(q)of+='&or=(code.ilike.*'+encodeURIComponent(q)+'*,customer_name.ilike.*'+encodeURIComponent(q)+'*,phone.ilike.*'+encodeURIComponent(q)+'*,contact_phone.ilike.*'+encodeURIComponent(q)+'*,official_sale_id.ilike.*'+encodeURIComponent(q)+'*)';
      of+='&order=created_at.desc&limit=200';
      const orders=await list('rds10_orders',of);
      const rows=[...(docs||[])];
      for(const o of (orders||[]))if(!seen.has(String(o.id)))rows.push({id:o.id,order_id:o.id,order_code:o.code||'',customer_name:o.customer_name||null,customer_phone:o.phone||o.contact_phone||null,official_sale_id:o.official_sale_id||null,created_at:o.created_at||o.completed_at||null,sent_at:null,updated_at:o.updated_at||null,pdf_base64:null});
      rows.sort((a,b)=>new Date(b.created_at||b.updated_at||0)-new Date(a.created_at||a.updated_at||0));
      res.json({ok:true,rows:rows.slice(0,200)});
    }catch(e){res.status(500).json({ok:false,error:String(e?.message||e)});}
  });
})();
`;
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync('server.js',server,'utf8');
