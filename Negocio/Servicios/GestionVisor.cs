using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Negocio.Persistencia;
using Negocio.Persistencia.Modelos;

namespace Negocio.Servicios
{
    public class GestionVisor : IGestionVisor
    {
        private readonly DharmaDbContext _context;
        private readonly ILogger<GestionVisor> _logger;

        /// <summary>
        /// Constructor de la clase GestionVisor
        /// </summary>
        /// <param name="context"></param>
        /// <param name="logger"></param>
        public GestionVisor(DharmaDbContext context, ILogger<GestionVisor> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene la lista de pacientes ordenada por apellidos y nombre
        /// </summary>
        /// <returns> Lista de pacientes </returns>
        public List<Paciente> GetPacientes()
        {
            var pacientes = _context.Pacientes
                 .AsNoTracking()
                 .OrderBy(p => p.Apellidos)
                 .ThenBy(p => p.Nombre)
                 .ThenBy(p => p.IdPaciente)
                 .ToList()
                 .DistinctBy(p => p.DNI)
                 .ToList();

            return pacientes;
        }

        /// <summary>
        /// Obtiene los datos de un paciente específico, incluyendo sus radiografías
        /// </summary>
        /// <param name="idPaciente"> Id del paciente </param>
        /// <returns> Datos del paciente o null si no se encuentra </returns>
        public Paciente? GetDatosPaciente(long idPaciente)
        {
            var paciente = _context.Pacientes
                .Include(p => p.Radiografias)
                .Where(p => p.IdPaciente == idPaciente)
                .FirstOrDefault();

            return paciente;
        }
    }
}
