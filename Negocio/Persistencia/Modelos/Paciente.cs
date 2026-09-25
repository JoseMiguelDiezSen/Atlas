using System.ComponentModel.DataAnnotations.Schema;

namespace Negocio.Persistencia.Modelos
{
    [Table("Pacientes")]
    public class Paciente
    {
        public int IdPaciente { get; set; }
        public string? NumeroHistoriaClinica { get; set; }
        public string? DNI { get; set; }
        public string? Nombre { get; set; }
        public string? Apellidos { get; set; }
        public DateTime? FechaNacimiento { get; set; }
        public string? Sexo { get; set; }
        public string? Telefono { get; set; }
        public string? Email { get; set; }
        public string? Direccion { get; set; }
        public string? CodigoPostal { get; set; }
        public string? Ciudad { get; set; }
        public string? Observaciones { get; set; }
        public DateTime FechaAlta { get; set; }
        public DateTime? FechaModificacion { get; set; }
        public bool Activo { get; set; }

        public virtual ICollection<Radiografia> Radiografias { get; set; } = new List<Radiografia>();
    }
}
