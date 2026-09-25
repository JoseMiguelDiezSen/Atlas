using Microsoft.AspNetCore.Mvc;
using Negocio.Servicios;
using System.Linq;

namespace Atlas.Controllers
{
    public class VisorController : Controller
    {
        private readonly IGestionVisor _gestionVisor;

        public VisorController(IGestionVisor gestionVisor)
        {
            _gestionVisor = gestionVisor;
        }

        public IActionResult Index()
        {
            ViewBag.Pacientes = _gestionVisor.GetPacientes();
            return View();
        }

        [HttpGet]
        public IActionResult GetDatosPaciente(long idPaciente)
        {
            var paciente = _gestionVisor.GetDatosPaciente(idPaciente);
            if (paciente == null)
            {
                return NotFound();
            }

            return Json(new
            {
                idPaciente = paciente.IdPaciente,
                nombre = paciente.Nombre,
                apellidos = paciente.Apellidos,
                dni = paciente.DNI,
                numeroHistoriaClinica = paciente.NumeroHistoriaClinica,
                fechaNacimiento = paciente.FechaNacimiento?.ToString("dd/MM/yyyy"),
                sexo = paciente.Sexo,
                telefono = paciente.Telefono,
                email = paciente.Email,
                direccion = paciente.Direccion,
                ciudad = paciente.Ciudad,
                observaciones = paciente.Observaciones,
                radiografias = paciente.Radiografias.Select(r => new
                {
                    idRadiografia = r.IdRadiografia,
                    nombreEstudio = r.NombreEstudio,
                    tipoRadiografia = r.TipoRadiografia,
                    zonaAnatomica = r.ZonaAnatomica,
                    studyDate = r.StudyDate?.ToString("dd/MM/yyyy"),
                    nombreArchivo = r.NombreArchivo
                }).ToList()
            });
        }
    }
}
