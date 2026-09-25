using System.ComponentModel.DataAnnotations.Schema;

namespace Negocio.Persistencia.Modelos
{
    [Table("Radiografias")]
    public class Radiografia
    {
        public int IdRadiografia { get; set; }

        [ForeignKey("Paciente")]
        public int IdPaciente { get; set; }
        public string? NombreEstudio { get; set; }
        public string? TipoRadiografia { get; set; }
        public string? ZonaAnatomica { get; set; }
        public string? StudyInstanceUID { get; set; }
        public string? SeriesInstanceUID { get; set; }
        public string? SOPInstanceUID { get; set; }
        public DateTime? StudyDate { get; set; }
        public string? NombreArchivo { get; set; }
        public long? TamanoBytes { get; set; }
        public byte[]? DICOM { get; set; }
        public DateTime FechaCarga { get; set; }

        public virtual Paciente? Paciente { get; set; }
    }
}
